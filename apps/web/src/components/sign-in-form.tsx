import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { AuthScreen } from "@/components/auth-screen";
import { BusyLabel } from "@/components/busy-label";
import { FieldError, fieldDescribedBy } from "@/components/field-error";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({ googleClientId = "" }: { googleClientId?: string }) {
  const navigate = useNavigate();
  const { isPending } = authClient.useSession();
  const showGoogle = googleClientId.trim() !== "";

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Berhasil masuk");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Masukkan email yang valid"),
        password: z.string().min(8, "Pilih kata sandi dengan minimal 8 karakter"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <AuthScreen title="Masuk" description="Masuk untuk kasbon, pekerjaan, dan gaji.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
          });
        }}
        className="space-y-6"
      >
        <form.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="nama@bengkel.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy("email-error", field.state.meta.errors)}
              />
              <FieldError id="email-error" errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Kata sandi</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="current-password"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={fieldDescribedBy("password-error", field.state.meta.errors)}
              />
              <FieldError id="password-error" errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <div className="space-y-3">
          <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
            {({ isSubmitting }) => (
              <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
                <BusyLabel busy={isSubmitting}>Masuk</BusyLabel>
              </Button>
            )}
          </form.Subscribe>

          {showGoogle ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                void authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/dashboard",
                });
              }}
            >
              Masuk dengan Google
            </Button>
          ) : null}
        </div>
      </form>
    </AuthScreen>
  );
}
