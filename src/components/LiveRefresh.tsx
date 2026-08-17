"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Слушает SSE и перезапрашивает серверные данные при новом сообщении. */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  return null;
}
