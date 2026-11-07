import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_FLOOR
from typing import Any
from urllib.parse import parse_qs
from xml.sax.saxutils import escape

from fastapi import FastAPI, Header, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from app.flatr_router import chat

load_dotenv()

app = FastAPI(title="RestaurantCall AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MENU: list[dict[str, Any]] = [
    {"id": "burger", "name": "Classic Burger", "category": "Mains", "description": "Grilled beef, cheddar, lettuce, tomato", "price_cents": 1299, "is_available": True, "stock_qty": 20},
    {"id": "fries", "name": "Crispy Fries", "category": "Sides", "description": "Sea salt and house seasoning", "price_cents": 499, "is_available": True, "stock_qty": 40},
    {"id": "salad", "name": "Garden Salad", "category": "Sides", "description": "Greens, cucumber, tomato, vinaigrette", "price_cents": 799, "is_available": True, "stock_qty": 15},
    {"id": "shake", "name": "Vanilla Shake", "category": "Drinks", "description": "Hand-spun vanilla ice cream", "price_cents": 599, "is_available": True, "stock_qty": 12},
]
ORDERS: list[dict[str, Any]] = []
CALL_SESSIONS: dict[str, dict[str, Any]] = {}
WEBHOOK_EVENTS: set[str] = set()
DEFAULT_TAX_RATE_BPS = 825


class OrderItem(BaseModel):
    item_id: str
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer_name: str = "Phone guest"
    customer_phone: str | None = None
    payment_method: str = "cash"
    items: list[OrderItem]
    notes: str | None = None


class StatusUpdate(BaseModel):
    status: str


def get_menu() -> list[dict[str, Any]]:
    return [item.copy() for item in MENU]


def check_availability(item_id: str, qty: int) -> dict[str, Any]:
    item = next((i for i in MENU if i["id"] == item_id), None)
    if not item:
        raise ValueError("Unknown menu item")
    available = bool(item["is_available"] and (item["stock_qty"] is None or item["stock_qty"] >= qty))
    alternatives = [i["name"] for i in MENU if i["category"] == item["category"] and i["id"] != item_id and i["is_available"]]
    return {"available": available, "item": item["name"], "alternatives": alternatives}


def _tax_rate_bps(tax_rate_bps: int | None = None) -> int:
    rate = DEFAULT_TAX_RATE_BPS if tax_rate_bps is None else tax_rate_bps
    if not 0 <= rate <= 10000:
        raise ValueError("tax_rate_bps must be between 0 and 10000")
    return rate


def quote_order(items: list[OrderItem], tax_rate_bps: int | None = None) -> dict[str, int]:
    subtotal = 0
    for requested in items:
        item = next((i for i in MENU if i["id"] == requested.item_id), None)
        if not item:
            raise ValueError(f"Unknown menu item: {requested.item_id}")
        subtotal += item["price_cents"] * requested.quantity
    # The MVP policy is to floor fractional tax cents. Using Decimal avoids
    # binary-float drift while keeping the configured rate in basis points.
    tax = int((Decimal(subtotal) * Decimal(_tax_rate_bps(tax_rate_bps)) / Decimal(10000)).to_integral_value(rounding=ROUND_FLOOR))
    return {"subtotal_cents": subtotal, "tax_cents": tax, "total_cents": subtotal + tax}


def place_order(payload: OrderCreate) -> dict[str, Any]:    # Validate the entire basket, including duplicate lines, before mutating stock.    # This is process-local only; production needs a database transaction.    if not payload.items:        raise ValueError("Order must contain at least one item")    quote = quote_order(payload.items)    quantities: dict[str, int] = {}    for requested in payload.items:        quantities[requested.item_id] = quantities.get(requested.item_id, 0) + requested.quantity    for item_id, quantity in quantities.items():        availability = check_availability(item_id, quantity)        if not availability["available"]:            raise ValueError(f"{availability['item']} is unavailable; offer a substitution before placing the order")    resolved_items = []    for requested in payload.items:        item = next(i for i in MENU if i["id"] == requested.item_id)        resolved_items.append({"item_id": item["id"], "item_name": item["name"], "quantity": requested.quantity, "unit_price_cents": item["price_cents"], "line_total_cents": item["price_cents"] * requested.quantity})    order = {"id": str(uuid.uuid4()), "customer_name": payload.customer_name, "customer_phone": payload.customer_phone, "payment_method": payload.payment_method, "payment_status": "unpaid" if payload.payment_method == "cash" else "pending", "status": "confirmed" if payload.payment_method == "cash" else "awaiting_payment", "items": resolved_items, "notes": payload.notes, **quote, "created_at": datetime.now(timezone.utc).isoformat()}    for item_id, quantity in quantities.items():        item = next(i for i in MENU if i["id"] == item_id)        if item["stock_qty"] is not None:            item["stock_qty"] -= quantity    ORDERS.insert(0, order)    return order


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "RestaurantCall AI API", "status": "ok", "health": "/health"}


@app.get("/config/public")
def public_config() -> dict[str, str | None]:
    return {"twilio_phone_number": os.getenv("TWILIO_PHONE_NUMBER") or None}


@app.get("/menu")
def menu() -> list[dict[str, Any]]:
    return get_menu()


@app.patch("/menu/{item_id}")
def update_menu(item_id: str, available: bool | None = None) -> dict[str, Any]:
    item = next((i for i in MENU if i["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "Menu item not found")
    if available is not None:
        item["is_available"] = available
    return item


@app.get("/orders")
def orders() -> list[dict[str, Any]]:
    return ORDERS


@app.post("/orders")
def create_order(payload: OrderCreate) -> dict[str, Any]:
    try:
        return place_order(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.patch("/orders/{order_id}/status")
def update_order_status(order_id: str, payload: StatusUpdate) -> dict[str, Any]:
    allowed = {"confirmed", "preparing", "ready", "completed"}
    if payload.status not in allowed:
        raise HTTPException(400, "Invalid order status")
    order = next((o for o in ORDERS if o["id"] == order_id), None)
    if not order:
        raise HTTPException(404, "Order not found")
    order["status"] = payload.status
    return order


def _twilio_signature_valid(request_url: str, params: dict[str, list[str]], signature: str | None) -> bool:
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not token:
        return True
    if not signature:
        return False
    canonical = request_url + "".join(f"{key}{values[0]}" for key, values in sorted(params.items()))
    expected = hmac.new(token.encode(), canonical.encode(), hashlib.sha1).digest()
    import base64
    return hmac.compare_digest(base64.b64encode(expected).decode(), signature)


def _public_request_url(request: Request) -> str:
    configured = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")
    return f"{configured}{request.url.path}" if configured else str(request.url)


@app.post("/twilio/voice")
async def twilio_voice(request: Request, x_twilio_signature: str | None = Header(default=None)) -> Response:
    form = parse_qs((await request.body()).decode("utf-8"))
    if not _twilio_signature_valid(_public_request_url(request), form, x_twilio_signature):
        raise HTTPException(403, "Invalid Twilio signature")
    call_sid = form.get("CallSid", [str(uuid.uuid4())])[0]
    CALL_SESSIONS[call_sid] = {"messages": [], "updated_at": datetime.now(timezone.utc)}
    base = os.getenv("PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/")
    xml = f'<Response><Gather input="speech" action="{escape(base)}/twilio/gather" method="POST" speechTimeout="auto" timeout="5"><Say>Welcome to RestaurantCall AI. Please state your order after the beep.</Say></Gather><Say>I did not hear anything. Goodbye.</Say></Response>'
    return Response(content=xml, media_type="application/xml")


def _voice_tools() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "get_menu",
                "description": "Return the current menu.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "place_order",
                "description": "Place a confirmed cash order.",
                "parameters": {
                    "type": "object",
                    "required": ["items"],
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["item_id", "quantity"],
                                "properties": {
                                    "item_id": {"type": "string"},
                                    "quantity": {"type": "integer"},
                                },
                            },
                        },
                        "customer_name": {"type": "string"},
                    },
                },
            },
        },
    ]


def _run_voice_turn(call_sid: str, transcript: str) -> str:
    session = CALL_SESSIONS.setdefault(call_sid, {"messages": [], "updated_at": datetime.now(timezone.utc)})
    session["updated_at"] = datetime.now(timezone.utc)
    messages = session["messages"]
    if not messages:
        messages.append({"role": "system", "content": "You take restaurant orders. Never invent prices or availability. Ask for explicit confirmation before placing an order. Keep replies under 35 words."})
    messages.append({"role": "user", "content": transcript})
    result = chat(messages, _voice_tools())
    assistant = result.get("choices", [{}])[0].get("message", {})
    tool_calls = assistant.get("tool_calls", [])
    if tool_calls:
        messages.append(assistant)
        for call in tool_calls:
            name = call.get("function", {}).get("name")
            args = json.loads(call.get("function", {}).get("arguments") or "{}")
            if name == "get_menu":
                output: Any = get_menu()
            elif name == "place_order":
                requested = [OrderItem(**item) for item in args.get("items", [])]
                output = place_order(OrderCreate(customer_name=args.get("customer_name", "Phone guest"), items=requested))
            else:
                output = {"error": "Unsupported tool"}
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(output)})
        result = chat(messages, _voice_tools())
        assistant = result.get("choices", [{}])[0].get("message", {})
    reply = assistant.get("content") or "I could not process that. Please try again."
    messages.append({"role": "assistant", "content": reply})
    return reply


@app.post("/twilio/gather")
async def twilio_gather(request: Request) -> Response:
    form = parse_qs((await request.body()).decode("utf-8"))
    signature = request.headers.get("X-Twilio-Signature")
    if not _twilio_signature_valid(_public_request_url(request), form, signature):
        raise HTTPException(403, "Invalid Twilio signature")
    call_sid = form.get("CallSid", [""])[0] or str(uuid.uuid4())
    transcript = form.get("SpeechResult", [""])[0].strip()
    if not transcript:
        reply = "I did not catch that. Please say your order again."
    else:
        try:
            reply = _run_voice_turn(call_sid, transcript)
        except Exception:
            reply = "I am having trouble reaching the order assistant. Please try again shortly."
    base = os.getenv("PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/")
    xml = f'<Response><Gather input="speech" action="{escape(base)}/twilio/gather" method="POST" speechTimeout="auto" timeout="5"><Say>{escape(reply)}</Say></Gather><Say>Thank you. Goodbye.</Say></Response>'
    return Response(content=xml, media_type="application/xml")


@app.websocket("/twilio/stream")
async def twilio_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    provider = os.getenv("AI_PROVIDER", "flatrouter")
    await websocket.send_json({"event": "connected", "provider": provider, "message": "Realtime bridge placeholder. Configure the provider credentials to enable live audio."})
    try:
        while True:
            await websocket.receive_text()
    except Exception:
        await websocket.close()


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="Stripe-Signature")) -> dict[str, bool]:
    body = await request.body()
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if secret:
        if not stripe_signature or not _stripe_signature_valid(body, stripe_signature, secret):
            raise HTTPException(400, "Invalid webhook signature")
    try:
        event = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid webhook JSON") from exc
    event_id = event.get("id")
    if event_id and event_id in WEBHOOK_EVENTS:
        return {"received": True}
    if event_id:
        WEBHOOK_EVENTS.add(event_id)
    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        order_id = session.get("metadata", {}).get("order_id")
        order = next((item for item in ORDERS if item["id"] == order_id), None)
        if order:
            order["payment_status"] = "paid"
            order["status"] = "confirmed"
    return {"received": True}


def _stripe_signature_valid(body: bytes, header: str, secret: str) -> bool:
    values: dict[str, list[str]] = {}
    for part in header.split(","):
        key, _, value = part.partition("=")
        values.setdefault(key, []).append(value)
    timestamp = values.get("t", [""])[0]
    signature = values.get("v1", [""])[0]
    if not timestamp or not signature:
        return False
    signed = f"{timestamp}.".encode() + body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
