import { runTest, assertEqual, assertDeepEqual } from "./testUtils";

function classifyScam(text: string): string {
    if (text.includes("Amazon")) return "Amazon Scam";
    if (text.includes("IRS")) return "IRS Scam";
    return "Unknown";
}

runTest("Detect Amazon scam", () => {
    assertEqual(classifyScam("This is Amazon support"), "Amazon Scam");
});

runTest("Detect IRS scam", () => {
    assertEqual(classifyScam("You owe taxes to the IRS"), "IRS Scam");
});

runTest("Detect unknown scam", () => {
    assertEqual(classifyScam("Hello from your cousin"), "Unknown");
});
