import { trpc } from "@/trpc/server";

export default async function Home() {
  const { message } = await trpc.example.hello();

  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-2xl font-semibold">{message}</p>
    </div>
  );
}
