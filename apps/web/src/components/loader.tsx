import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div
      role="status"
      aria-label="Memuat"
      className="flex min-h-32 items-center justify-center pt-8"
    >
      <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" />
    </div>
  );
}
