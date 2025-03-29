export function runTest(description: string, fn: () => void): void {
    try {
        fn();
        console.log(`✅ ${description}`);
    } catch (error: any) {
        console.error(`❌ ${description}`);
        console.error(`   → ${error.message}`);
    }
}

export function assertEqual(actual: any, expected: any): void {
    if (actual !== expected) {
        throw new Error(`Expected "${expected}", but got "${actual}"`);
    }
}

export function assertDeepEqual(actual: any, expected: any): void {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new Error(`Expected:\n${b}\nGot:\n${a}`);
    }
}


/* Sample test:
runTest("Description of test", () => {
  const result = myFunction("input");
  assertEqual(result, "expected");
});

Run with: npx ts-node test/parseData.ts
 */
