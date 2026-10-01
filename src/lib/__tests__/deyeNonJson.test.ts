import { describe, it, expect } from "vitest";
import { readDeyeJson, describeNonJson, nonJsonExcerpt, DeyeNonJsonError } from "../../worker/deye";

const cfHtml = `\r\n<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1">
<TITLE>ERROR: The request could not be satisfied</TITLE></HEAD><BODY><H1>403 ERROR</H1></BODY></HTML>`;

const caught = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as DeyeNonJsonError; } throw new Error("expected a throw"); };

describe("readDeyeJson — a non-JSON Deye reply explains itself without leaking", () => {
  it("parses a normal JSON envelope", async () => {
    const r = new Response(JSON.stringify({ success: true, code: "1000000" }), { status: 200 });
    await expect(readDeyeJson(r, "/station/latest")).resolves.toEqual({ success: true, code: "1000000" });
  });

  it("HTML page → public message is path/status/CDN only; title is operator detail", async () => {
    const r = new Response(cfHtml, {
      status: 403,
      headers: { server: "CloudFront", "x-cache": "Error from cloudfront", "x-amz-cf-pop": "FRA56-P1" },
    });
    const e = await caught(readDeyeJson(r, "/station/latest"));
    expect(e).toBeInstanceOf(DeyeNonJsonError);
    expect(e.message).toBe("Deye /station/latest HTTP 403 non-JSON (CloudFront · Error from cloudfront · FRA56-P1)");
    expect(e.detail).toBe("ERROR: The request could not be satisfied");
  });

  it("regression: a truncated token reply never reaches the public message", async () => {
    const secret = "REVIEW_SYNTHETIC_ACCESS_TOKEN_DO_NOT_PUBLISH";
    const e = await caught(readDeyeJson(new Response(`{"accessToken":"${secret}"`, { status: 200 }), "/account/token"));
    expect(e.message).toBe("Deye /account/token HTTP 200 non-JSON");
    expect(e.message).not.toContain(secret);
  });

  it("CDN header values are reduced to a safe token set", () => {
    const h = new Headers({ server: 'evil"<script>{"t":"x"}' });
    expect(describeNonJson(502, h, "/x")).toBe("Deye /x HTTP 502 non-JSON (evilscripttx)");
  });

  it("excerpt: title, else short tag-stripped text, else named empty", () => {
    expect(nonJsonExcerpt("<html><body><h1>Bad   gateway</h1></body></html>")).toBe("Bad gateway");
    expect(nonJsonExcerpt("")).toBe("(empty body)");
    expect(nonJsonExcerpt("<p>" + "a".repeat(500) + "</p>").length).toBe(120);
  });
});
