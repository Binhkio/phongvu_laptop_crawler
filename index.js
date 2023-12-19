const { default: axios } = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { Scraper, Root, OpenLinks, CollectContent, DownloadContent } = require('nodejs-web-scraper');
const cloudscraper = require('cloudscraper');

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

(async () => {
    const laptops = []

    const getPageObject = (pageObject, address) => {
        if (address.includes("--s")) {
            const id = `${address}`.split("--s").pop();
            laptops.push({ id, address, ...pageObject });
        }
        if (address.includes("sku=")) {
            const id = `${address}`.split("sku=").pop();
            laptops.push({ id, address, ...pageObject });
        }
    }

    const scraper = new Scraper({
        baseSiteUrl: `https://phongvu.vn/c/laptop`,
        startUrl: `https://phongvu.vn/c/laptop`,
        filePath: `./data/`,
        concurrency: 50,
        maxRetries: 3,
        delay: 1000 * 0.3,
        onError: console.log,
    });

    const root = new Root({
        pagination: {
            queryString: 'page',
            begin: 1,
            end: 26,
        }
    });

    const laptop = new OpenLinks(`.product-card a`, { name: 'laptop', getPageObject });

    const info = new CollectContent(`html`, { name: 'info', contentType: 'html' })

    root.addOperation(laptop);
    laptop.addOperation(info);

    await scraper.scrape(root);

    /**
     * Get prices of each laptop
     */
    console.log("GETTING PRICES");

    const firstData = await Promise.allSettled(laptops.map(async (lap, index) => {
        try {
            const res = await axios.get(`https://carts-beta.tekoapis.com/api/v2/products/${lap.id}?terminal=phongvu&quantity=1`, {
                headers: {
                    referer: "https://phongvu.vn/"
                }
            });

            console.log(`[${index}] Getting price of id_${lap.id}: ${res.data.data.supplierRetailPrice}`);
            return {
                ...lap,
                price: res.data.data.supplierRetailPrice,
            }
        } catch (error) {
            console.log(`[First] Error at ${lap?.address}`)
            return {
                ...lap,
                price: ''
            }
        }
    })).then(results => results.map(result => result.value))

    /**
     * Get product details
     */
    const secondData = await Promise.allSettled(firstData.map(async (lap, index) => {
        const data = {
            dong_may: '',
            cpu: '',
            ram: '',
            o_cung: '',
            man_hinh: '',
            card_man_hinh: '',
            kich_thuoc: '',
            khoi_luong: '',
            pin: '',
            he_dieu_hanh: '',
        }
        try {
            console.log(`[${index}] Get product details at ${lap.address}`);

            const res = await axios.get(`https://discovery.tekoapis.com/api/v1/product?sku=${lap.id}&location=&terminalCode=phongvu`, {
                headers: {
                    referer: "https://phongvu.vn/"
                }
            });
            const attrGroups = res.data.result.product.productDetail.attributeGroups

            attrGroups.forEach((ele, idx) => {
                const value = ele?.value;
                switch (ele?.name) {
                    case "Thương hiệu":
                        if (!!value)
                            data.dong_may = value;
                        break;
                    case "CPU":
                        if (!!value)
                            data.cpu = value;
                        break;
                    case "RAM":
                        if (!!value)
                            data.ram = value;
                        break;
                    case "Lưu trữ" | "Dung lượng SSD":
                        if (!!value)
                            data.o_cung = value;
                        break;
                    case "Màn hình":
                        if (!!value) {
                            const inch = value.split(`\"`)[0];
                            const size = value.split(`\(`)[1].split(`\)`)[0];

                            data.man_hinh = `${inch} inch`;

                            if (value.toLowerCase().search("qhd") > 0) data.do_phan_giai = `QHD (${size})`;
                            if (value.toLowerCase().search("hd") > 0) data.do_phan_giai = `HD (${size})`;
                            if (value.toLowerCase().search("fullhd") > 0 || value.toLowerCase().search("full hd") > 0) data.do_phan_giai = `FullHD (${size})`;
                            if (value.toLowerCase().search("2k") > 0) data.do_phan_giai = `2K (${size})`;
                            if (value.toLowerCase().search("4k") > 0) data.do_phan_giai = `4K (${size})`;
                        }
                        break;
                    case "Chip đồ họa":
                        if (!!value)
                            data.card_man_hinh = value;
                        break;
                    case "Kích thước":
                        if (!!value)
                            data.kich_thuoc = value;
                        break;
                    case "Khối lượng":
                        if (!!value)
                            data.khoi_luong = value;
                        break;
                    case "Pin":
                        if (!!value)
                            data.pin = value;
                        break;
                    case "Hệ điều hành":
                        if (!!value)
                            data.he_dieu_hanh = value;
                        break;
                    default:
                        break;
                }
            })

            const attr = res.data.result.product.productDetail.attributes

            attr.forEach((ele, idx) => {
                const value = ele?.values[0];
                switch (ele?.code) {
                    // case "Thương hiệu":
                    //     if (!!value)
                    //         data.dong_may = value;
                    //     break;
                    case "laptop_tencpu":
                        if (!!value)
                            data.cpu = value;
                        break;
                    case "laptop_dungluongbonho":
                        if (!!value)
                            data.ram = value;
                        break;
                    case "laptop_dungluongssd":
                        if (!!value)
                            data.o_cung = value;
                        break;
                    case "laptop_dophangiaimanhinh":
                        if (!!value)
                            data.do_phan_giai = value;
                        break;
                    case "laptop_kichthuocmanhinh":
                        if (!!value) {
                            const inch = value.split(`\"`)[0];
                            data.man_hinh = `${inch} inch`
                        }
                        break;
                    case "laptop_chipdohoaroi" | "laptop_chipdohoatichhop":
                        if (!!value)
                            data.card_man_hinh = value;
                        break;
                    case "laptop_kichthuoc":
                        if (!!value)
                            data.kich_thuoc = value;
                        break;
                    case "laptop_khoiluong":
                        if (!!value)
                            data.khoi_luong = value;
                        break;
                    case "laptop_dungluongpin":
                        if (!!value)
                            data.pin = value;
                        break;
                    case "laptop_hedieuhanh":
                        if (!!value)
                            data.he_dieu_hanh = value;
                        break;
                    default:
                        break;
                }
            })

        } catch (error) {
            console.log(`[Second] Error at ${lap?.address}`)
        }

        return {
            ...lap,
            ...data,
        }
    })).then(results => results.map(result => result.value))

    /**
     * Modify data
     */
    const finalData = secondData.map(({ id, info, ...data }, _) => data)

    const header = Object.keys(finalData[0]).join(",")
    const rows = finalData
        .map(obj =>
            Object.values(obj).map(val => val.toString().replace(/,/g, "").trim())
                .join(",")
        ).join("\n")

    const csv_data = `${header}\n${rows}`

    fs.writeFile('./phongvu.json', JSON.stringify(finalData, null, 2), (err) => {
        if (err) {
            console.log("Something went wrong!!!");
        } else {
            console.log("Save file successed (json)");
        }
    });
    fs.writeFile('./phongvu.csv', csv_data, (err) => {
        if (err) {
            console.log("Something went wrong!!!");
        } else {
            console.log("Save file successed (csv)");
        }
    });

})()