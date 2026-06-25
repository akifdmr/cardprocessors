const axios = require("axios");

async function checkBin(bin) {
    if (!bin || bin.trim() === "") {
        throw new Error("Bin not found");
    }

    const url = `https://bin-check-dr4g.herokuapp.com/api/${bin}`;

    try {
        const { data } = await axios.get(url);

        if (data.result === "false") {
            throw new Error("Bin Error");
        }

        const result = {
            bin: data.data.bin,
            vendor: data.data.vendor,
            type: data.data.type,
            level: data.data.level,
            bank: data.data.bank,
            country: data.data.country
        };

        // Console'a yaz
        console.log("BIN RESULT:");
        console.table(result);

        // Response olarak döndür
        return {
            success: true,
            data: result
        };

    } catch (err) {
        console.error(err.message);

        return {
            success: false,
            error: err.message
        };
    }
}

// Örnek kullanım
(async () => {
    const response = await checkBin("536025");

    console.log("\nReturned Response:");
    console.log(JSON.stringify(response, null, 2));
})();