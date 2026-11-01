import "./globals.css";
import Link from "next/link";

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body><div className="shell"><header className="topbar"><Link className="brand" href="/dashboard">RestaurantCall AI</Link><nav className="nav"><Link href="/dashboard">Orders</Link><Link href="/menu">Menu</Link></nav></header>{children}</div></body></html>
}
