import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { useRef } from "react";

import { BusyLabel } from "@/components/busy-label";

export function AbsenClockButton({
  checkedIn,
  checkedOut,
  busy,
  onFile,
}: {
  checkedIn: boolean;
  checkedOut: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const done = checkedOut;
  const label = done ? "Sudah absen pulang" : checkedIn ? "Absen pulang" : "Absen masuk";

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        className="h-14 min-h-14 w-full text-base"
        size="lg"
        disabled={done || busy}
        aria-busy={busy}
        onClick={() => inputRef.current?.click()}
      >
        <BusyLabel busy={busy}>{label}</BusyLabel>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Buka kamera, lalu GPS dicek di titik bengkel.
      </p>
    </div>
  );
}
