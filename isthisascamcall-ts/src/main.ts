// main.ts
async function getNumberData(number: string) {
    const res = await fetch("/data/fakenums.json");
    const data = await res.json();
    console.log("Fetched data from browser:", data);  // <--- make sure this is here
    return data;
}

getNumberData("8331234567");
