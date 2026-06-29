import { getInspectionData } from "../../../../lib/inspectionDataService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelNo = url.searchParams.get("modelNo");

  return Response.json(await getInspectionData(modelNo));
}