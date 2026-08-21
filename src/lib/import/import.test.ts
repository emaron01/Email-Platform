import { describe, expect, it } from "vitest";
import {
  assertUniqueFieldMappings,
  buildDuplicateIndexes,
  defaultListNameForPaste,
  detectDelimiter,
  findDuplicateRows,
  isDuplicateContact,
  normalizeEmail,
  parseCsvText,
  parseDelimitedText,
  parseEmployeeCount,
  parseRevenue,
  suggestColumnMapping,
  suggestDestination,
  validateMappedRows,
} from "@/lib/import";

describe("pasted tab-delimited parsing", () => {
  it("parses headers and rows from Excel-style TSV", () => {
    const text = [
      "First Name\tLast Name\tEmail\tTitle\tCompany\tIndustry\tEmployees",
      "John\tSmith\tjohn@acme.com\tVP Sales\tAcme\tSoftware\t125",
      "Jane\tDoe\tjane@beta.com\tCRO\tBeta\tTechnology\t80",
    ].join("\n");

    expect(detectDelimiter(text)).toBe("\t");
    const parsed = parseDelimitedText(text);
    expect(parsed.headers).toEqual([
      "First Name",
      "Last Name",
      "Email",
      "Title",
      "Company",
      "Industry",
      "Employees",
    ]);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows[0][2]).toBe("john@acme.com");
  });
});

describe("CSV parsing", () => {
  it("parses comma-delimited CSV and removes blank rows", () => {
    const text = [
      "first_name,last_name,email,company",
      "Ada,Lovelace,ada@example.com,Analytical Engines",
      ",,,",
      "Grace,Hopper,grace@example.com,Navy",
      "",
    ].join("\n");

    const parsed = parseCsvText(text);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows[1][0]).toBe("Grace");
  });

  it("detects semicolon delimiter", () => {
    const text = "First Name;Email\nJohn;john@acme.com";
    expect(detectDelimiter(text)).toBe(";");
    const parsed = parseDelimitedText(text);
    expect(parsed.rows[0][1]).toBe("john@acme.com");
  });
});

describe("column mapping", () => {
  it("suggests common aliases", () => {
    expect(suggestDestination("first_name")).toBe("firstName");
    expect(suggestDestination("First Name")).toBe("firstName");
    expect(suggestDestination("First")).toBe("firstName");
    expect(suggestDestination("company_name")).toBe("company");
    expect(suggestDestination("Account")).toBe("company");
    expect(suggestDestination("employee_count")).toBe("employeeCount");
    expect(suggestDestination("company_size")).toBe("employeeCount");
  });

  it("does not assign the same destination twice", () => {
    const mapping = suggestColumnMapping([
      "First Name",
      "first_name",
      "Email",
      "Company",
    ]);
    expect(mapping["First Name"]).toBe("firstName");
    expect(mapping.first_name).toBe("ignore");
    expect(mapping.Email).toBe("email");
    expect(mapping.Company).toBe("company");
  });

  it("rejects duplicate destination mappings", () => {
    const result = assertUniqueFieldMappings({
      A: "email",
      B: "email",
    });
    expect(result.ok).toBe(false);
  });
});

describe("validation helpers", () => {
  it("normalizes email casing and trims", () => {
    expect(normalizeEmail("  John@Acme.COM ")).toBe("john@acme.com");
  });

  it("parses employee count and revenue", () => {
    expect(parseEmployeeCount("1,250").value).toBe(1250);
    expect(parseEmployeeCount("50-100").value).toBe(75);
    expect(parseRevenue("$1.5M").value).toBe(1_500_000);
  });

  it("marks missing email as warning and invalid email as error", () => {
    const rows = validateMappedRows(
      ["First Name", "Email", "Company"],
      [
        ["John", "", "Acme"],
        ["Jane", "not-an-email", "Beta"],
        ["", "", ""],
      ],
      {
        "First Name": "firstName",
        Email: "email",
        Company: "company",
      },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("warning");
    expect(rows[0].issues.some((issue) => issue.message.includes("Email is missing"))).toBe(
      true,
    );
    expect(rows[1].status).toBe("invalid");
  });

  it("preserves unmapped columns in rawData", () => {
    const rows = validateMappedRows(
      ["Email", "Custom Score", "Company"],
      [["a@b.com", "99", "Acme"]],
      {
        Email: "email",
        "Custom Score": "ignore",
        Company: "company",
      },
    );

    expect(rows[0].contact.rawData["Custom Score"]).toBe("99");
    expect(rows[0].contact.company).toBe("Acme");
  });
});

describe("duplicate detection", () => {
  it("detects tenant-scoped email duplicates", () => {
    const indexes = buildDuplicateIndexes([
      {
        email: "john@acme.com",
        firstName: "John",
        lastName: "Smith",
        company: "Acme",
      },
    ]);

    expect(
      isDuplicateContact(
        {
          firstName: "Other",
          lastName: "Person",
          email: "JOHN@acme.com",
          title: null,
          company: null,
          companyWebsite: null,
          industry: null,
          employeeCount: null,
          revenue: null,
          location: null,
          linkedinUrl: null,
          phone: null,
          rawData: {},
        },
        indexes,
      ),
    ).toBe(true);
  });

  it("detects name+company duplicates when email is absent", () => {
    const duplicates = findDuplicateRows(
      [
        {
          firstName: "Jane",
          lastName: "Doe",
          email: null,
          title: null,
          company: "Beta",
          companyWebsite: null,
          industry: null,
          employeeCount: null,
          revenue: null,
          location: null,
          linkedinUrl: null,
          phone: null,
          rawData: {},
        },
      ],
      [
        {
          email: null,
          firstName: "Jane",
          lastName: "Doe",
          company: "Beta",
        },
      ],
    );

    expect(duplicates).toEqual([0]);
  });
});

describe("paste/upload pipeline remains operational", () => {
  it("still parses tab-delimited pasted contacts", () => {
    const text = "First Name\tEmail\nAda\tada@example.com";
    const parsed = parseDelimitedText(text);
    expect(parsed.totalRows).toBe(1);
    expect(parsed.rows[0][1]).toBe("ada@example.com");
  });

  it("builds pasted list default name", () => {
    expect(defaultListNameForPaste(new Date("2026-03-20T12:00:00Z"))).toBe(
      "Pasted Contacts - 2026-03-20",
    );
  });
});
