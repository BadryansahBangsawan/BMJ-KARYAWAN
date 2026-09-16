import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
  const navigate = useNavigate();
  const { isPending } = authClient.useSession();
  const googleClientId = import.meta.env.GOOGLE_CLIENT_ID;
  const viteGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const showGoogle =
    (typeof googleClientId === "string" && googleClientId.trim() !== "") ||
    (typeof viteGoogleClientId === "string" && viteGoogleClientId.trim() !== "");

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
        email: z.email("Email tidak valid"),
        password: z.string().min(8, "Kata sandi minimal 8 karakter"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-8">
      <h1 className="mb-6 text-center text-3xl font-bold text-balance tracking-tight">Masuk</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <div>
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
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={field.state.meta.errors.length > 0 ? "email-error" : undefined}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} id="email-error" className="text-sm text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
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
                  aria-describedby={
                    field.state.meta.errors.length > 0 ? "password-error" : undefined
                  }
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} id="password-error" className="text-sm text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
          {({ isSubmitting }) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Memproses..." : "Masuk"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      {showGoogle ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
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
  );
}
