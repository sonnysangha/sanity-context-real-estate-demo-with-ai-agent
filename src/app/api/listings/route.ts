import { getListings, getSavedListings } from "@/lib/catalogue";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const ids = new URL(req.url).searchParams.get("ids");
    if (ids) {
      const parsed = ids
        .split(",")
        .filter((x) => /^homematch-listing-[a-z0-9-]+$/.test(x))
        .slice(0, 50);
      return Response.json({
        listings: await getSavedListings(parsed),
        configured: true,
      });
    }
    return Response.json(await getListings());
  } catch {
    return Response.json(
      { error: "The listing catalogue could not be loaded. Please try again." },
      { status: 503 },
    );
  }
}
