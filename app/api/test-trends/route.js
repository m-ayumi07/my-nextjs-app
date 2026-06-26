import { getTrends } from "@/lib/trends";

export async function GET() {
  const data = await getTrends();
  return Response.json(data);
}
