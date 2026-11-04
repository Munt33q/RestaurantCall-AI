import "./globals.css";
import AppHeader from "@/components/AppHeader";

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body><div className="shell"><AppHeader/>{children}</div></body></html>
}
