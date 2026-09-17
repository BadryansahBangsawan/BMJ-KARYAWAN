import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@BMJ-KARYAWAN/ui/components/dialog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BusyLabel } from "@/components/busy-label";
import { jpegFileFromVideo } from "@/lib/workshop-gps";

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
  const streamRef = useRef<MediaStream | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [open, setOpen] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const done = checkedOut;
  const label = done ? "Sudah absen pulang" : checkedIn ? "Absen pulang" : "Absen masuk";

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoEl) videoEl.srcObject = null;
  }

  function closeCamera() {
    stopCamera();
    setOpen(false);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Kamera tidak tersedia di perangkat ini.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setOpen(true);
    } catch {
      toast.error("Izin kamera ditolak. Aktifkan kamera di pengaturan browser.");
    }
  }

  useEffect(() => {
    if (!open || !videoEl || !streamRef.current) return;
    videoEl.srcObject = streamRef.current;
    void videoEl.play();
  }, [open, videoEl]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function snap() {
    if (!videoEl) return;
    setSnapping(true);
    try {
      const file = await jpegFileFromVideo(videoEl);
      closeCamera();
      onFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengambil foto.");
    } finally {
      setSnapping(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        className="h-14 min-h-14 w-full text-base"
        size="lg"
        disabled={done || busy}
        aria-busy={busy}
        onClick={() => void openCamera()}
      >
        <BusyLabel busy={busy}>{label}</BusyLabel>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Kamera depan, lalu GPS dicek di titik bengkel.
      </p>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeCamera();
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Ambil foto absen</DialogTitle>
            <DialogDescription>Hadapkan wajah ke kamera, lalu ambil foto.</DialogDescription>
          </DialogHeader>
          <video
            ref={setVideoEl}
            className="aspect-square w-full rounded-xl bg-black object-cover [transform:scaleX(-1)]"
            autoPlay
            muted
            playsInline
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCamera}>
              Batal
            </Button>
            <Button type="button" disabled={snapping} aria-busy={snapping} onClick={() => void snap()}>
              <BusyLabel busy={snapping}>Ambil foto</BusyLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
