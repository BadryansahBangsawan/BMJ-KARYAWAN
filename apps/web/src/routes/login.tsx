import { Button } from "@BMJ-KARYAWAN/ui/components/button";
import { Input } from "@BMJ-KARYAWAN/ui/components/input";
import { Label } from "@BMJ-KARYAWAN/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { AuthScreen } from "@/components/auth-screen";
import { BusyLabel } from "@/components/busy-label";
import SignInForm from "@/components/sign-in-form";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
  loader: async ({ context }) => {
    const result = await context.queryClient.ensureQueryData(
      context.trpc.auth.bootstrapNeeded.queryOptions(),
    );
    return { bootstrapNeeded: result.needed };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { bootstrapNeeded } = Route.useLoaderData();
  return bootstrapNeeded ? <BootstrapSupervisorForm /> : <SignInForm />;
}

function BootstrapSupervisorForm() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const bootstrap = useMutation(trpc.auth.bootstrapSupervisor.mutationOptions());

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await bootstrap.mutateAsync({
          name: value.name,
          email: value.email,
          password: value.password,
        });
        await authClient.signIn.email(
          {
            email: value.email,
            password: value.password,
          },
          {
            onSuccess: () => {
              navigate({ to: "/dashboard" });
              toast.success("Akun supervisor dibuat");
            },
            onError: (error) => {
              toast.error(error.error.message || error.error.statusText);
            },
          },
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Gagal membuat akun supervisor");
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Masukkan nama"),
        email: z.email("Masukkan email yang valid"),
        password: z.string().min(8, "Pilih kata sandi dengan minimal 8 karakter"),
      }),
    },
  });

  return (
    <AuthScreen
      title="Buat akun supervisor"
      description="Database masih kosong. Buat akun supervisor pertama untuk mulai memakai BMJ Karyawan."
    >
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
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Nama</Label>
              <Input
                id={field.name}
                name={field.name}
                autoComplete="name"
                placeholder="Budi"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={field.state.meta.errors.length > 0 ? "name-error" : undefined}
              />
              {field.state.meta.errors.map((error) => (
                <p key={error?.message} id="name-error" className="text-sm text-destructive">
                  {error?.message}
                </p>
              ))}
            </div>
          )}
        </form.Field>
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
        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Kata sandi</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="new-password"
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
        <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
          {({ isSubmitting }) => (
            <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
              <BusyLabel busy={isSubmitting}>Buat akun supervisor</BusyLabel>
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthScreen>
  );
}
