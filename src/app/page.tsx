import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="relative min-h-[calc(100dvh-3.5rem-4.25rem)] overflow-hidden md:min-h-[calc(100dvh-3.5rem)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2346573f' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-center px-4 py-16 sm:py-24 md:py-32">
        <h1 className="font-serif text-4xl tracking-tight text-primary sm:text-5xl md:text-6xl">
          Gia Phả Cao Tổ
        </h1>
        <div className="mt-8 grid w-full max-w-sm grid-cols-1 gap-3 sm:flex sm:max-w-none sm:flex-wrap">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" size="lg">
              Xem gia phả
            </Button>
          </Link>
          <Link href="/login" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" variant="outline" size="lg">
              Đăng nhập
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
