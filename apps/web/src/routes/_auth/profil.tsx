import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AvatarBubble } from "@/components/avatar-bubble";
import { BusyLabel } from "@/components/busy-label";
import { FieldError, fieldDescribedBy } from "@/components/field-error";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PAGE_DESCRIPTION } from "@/lib/app-nav";
import { authClient } from "@/lib/auth-client";
import { roleLabel, sessionRole } from "@/lib/session-role";
import { jpegDataUrlFromFile } from "@/lib/workshop-gps";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/profil")({
  component: ProfilPage,
});

function ProfilPage() {
  const { session } = Route.useRouteContext();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageDraft, setImageDraft] = useState<string | null | undefined>(undefined);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const role = sessionRole(session?.user);
  const name = session.user.name?.trim() || "Karyawan";
  const preview = imageDraft === undefined ? session.user.image : imageDraft;

  const updateMut = useMutation(
    trpc.employee.updateProfile.mutationOptions({
      onSuccess: async () => {
        toast.success("Profil disimpan");
        await authClient.getSession({ query: { disableCookieCache: true } });
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const path = query.queryKey[0];
            return Array.isArray(path) && path[0] === "employee";
          },
        });
        setImageDraft(undefined);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useForm({
    defaultValues: { name },
    onSubmit: async ({ value }) => {
      await updateMut.mutateAsync({
        name: value.name.trim(),
        ...(imageDraft !== undefined ? { image: imageDraft } : {}),
      });
    },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, "Masukkan nama."),
      }),
    },
  });

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await jpegDataUrlFromFile(file, 192, 20_000);
      setImageDraft(url);
    } catch {
      toast.error("Foto tidak bisa diproses. Coba foto lain.");
    }
  }

  async function onChangePassword() {
    if (newPassword.length < 8) {
      toast.error("Kata sandi baru minimal 8 karakter.");
      return;
    }
    if (!currentPassword) {
      toast.error("Masukkan kata sandi saat ini.");
      return;
    }
    setPasswordBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPasswordBusy(false);
    if (error) {
      toast.error(error.message || "Gagal mengubah kata sandi.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    toast.success("Kata sandi diubah");
  }

  return (
    <PageShell narrow>
      <PageHeader title="Profil" description={PAGE_DESCRIPTION["/profil"]} />

      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="flex flex-col items-start gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onPickPhoto(file);
            }}
          />
          <button
            type="button"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => fileRef.current?.click()}
            aria-label="Ubah foto profil"
          >
            <AvatarBubble name={name} image={preview} className="size-24 text-2xl" />
          </button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Ubah foto
            </Button>
            {preview ? (
              <Button type="button" variant="ghost" onClick={() => setImageDraft(null)}>
                Hapus foto
              </Button>
            ) : null}
          </div>
          <p className="text-pretty text-sm text-muted-foreground">{roleLabel(role)}</p>
        </div>

        <form.Field name="name">
          {(field) => {
            const errorId = "profil-name-error";
            return (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Nama</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={fieldDescribedBy(errorId, field.state.meta.errors)}
                />
                <FieldError id={errorId} errors={field.state.meta.errors} />
              </div>
            );
          }}
        </form.Field>

        <div className="space-y-2">
          <Label htmlFor="profil-email">Email</Label>
          <Input id="profil-email" value={session.user.email} disabled />
        </div>

        <Button type="submit" disabled={updateMut.isPending} aria-busy={updateMut.isPending}>
          <BusyLabel busy={updateMut.isPending}>Simpan profil</BusyLabel>
        </Button>
      </form>

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Kata sandi</h2>
        <div className="space-y-2">
          <Label htmlFor="profil-current-password">Kata sandi saat ini</Label>
          <Input
            id="profil-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profil-new-password">Kata sandi baru</Label>
          <Input
            id="profil-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={passwordBusy}
          aria-busy={passwordBusy}
          onClick={() => void onChangePassword()}
        >
          <BusyLabel busy={passwordBusy}>Ubah kata sandi</BusyLabel>
        </Button>
      </section>

      <div className="border-t border-border pt-6">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  void navigate({ to: "/" });
                },
              },
            });
          }}
        >
          Keluar
        </Button>
      </div>
    </PageShell>
  );
}
