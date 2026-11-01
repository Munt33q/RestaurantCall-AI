"""Small OpenAI-compatible HTTP client for FlatRouter.

FlatRouter is used only over HTTPS Chat Completions here. Audio stays in Twilio's
Gather/Say pipeline because FlatRouter does not document a Realtime audio socket.
"""
import json
import os
import urllib.request
from typing import Any


def chat(messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    api_key = os.getenv("AI_API_KEY", "")
    if not api_key:
        raise RuntimeError("AI_API_KEY is not configured")
    base_url = os.getenv("AI_BASE_URL", "https://api.flatrouter.com/v1").rstrip("/")
    payload: dict[str, Any] = {"model": os.getenv("AI_MODEL", "gpt-4o-mini"), "messages": messages, "temperature": 0.2}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))
