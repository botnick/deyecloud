import { describe, it, expect } from "vitest";
import { readDeyeJson, describeNonJson } from "../../worker/deye";

const cfHtml = `\r\n<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1">
<TITLE>ERROR: The request could not be satisfied</TITLE></HEAD><BODY><H1>403 ERROR</H1></BODY></HTML>`;

describe("readDeyeJson — a non-JSON Deye reply explains itself", () => {
  it("parses a normal JSON envelope", async () => {
    const r = new Response(JSON.stringify({ success: true, code: "1000000" }), { status: 200 });
    await expect(readDeyeJson(r, "/station/latest")).resolves.toEqual({ success: true, code: "1000000" });
  });

  it("HTML page → error with path, status, CDN and page title", async () => {
    const r = new Response(cfHtml, {
      status: 403,
      headers: { server: "CloudFront", "x-cache": "Error from cloudfront", "x-amz-cf-pop": "FRA56-P1" },
    });
    await expect(readDeyeJson(r, "/station/latest")).rejects.toThrow(
      "Deye /station/latest HTTP 403 non-JSON (CloudFront · Error from cloudfront · FRA56-P1): ERROR: The request could not be satisfied",
    );
  });

  it("no title → short tag-stripped excerpt; empty body is named", () => {
    expect(describeNonJson(502, new Headers(), "<html><body><h1>Bad   gateway</h1></body></html>", "/x")).toBe(
      "Deye /x HTTP 502 non-JSON: Bad gateway",
    );
    expect(describeNonJson(500, new Headers(), "", "/x")).toBe("Deye /x HTTP 500 non-JSON: (empty body)");
    expect(describeNonJson(500, new Headers(), "<p>" + "a".repeat(500) + "</p>", "/x").length).toBeLessThan(160);
  });
});
