import { getTopStory } from "@/lib/score";

export async function GET() {
  const story = await getTopStory();
  return Response.json(story);
}
