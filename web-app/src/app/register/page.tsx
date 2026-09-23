import { AuthForm } from "@/features/auth/auth-form";
export const metadata = { title: "Create an account" };
export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
