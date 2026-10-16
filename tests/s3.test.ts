import { describe, expect, it } from "vitest";
import { EMPTY_SHA256, signS3 } from "@/lib/s3";

describe("S3 SigV4 signer", () => {
  it("matches AWS's published GET Object example", () => {
    // docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html, "Example: GET Object"
    const c = {
      bucket: "examplebucket",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      host: "examplebucket.s3.amazonaws.com",
    };
    const s = signS3(c, "GET", "test.txt", { Range: "bytes=0-9" }, EMPTY_SHA256, "20130524T000000Z");
    expect(s.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    expect(s.url).toBe("https://examplebucket.s3.amazonaws.com/test.txt");
    expect(s.headers).not.toHaveProperty("host");
  });
});
