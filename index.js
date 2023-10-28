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
        const id = `${address}`.split("--s").pop();
        laptops.push({id, address, ...pageObject});
    }

    const scraper = new Scraper({
        baseSiteUrl: `https://phongvu.vn/c/laptop`,
        startUrl: `https://phongvu.vn/c/laptop`,
        filePath: `./data/`,
        concurrency: 10,
        maxRetries: 3,
        delay: 1000*0.3,
        onError: console.log,
    });

    const root = new Root();

    const laptop = new OpenLinks(`.product-card a`, { name: 'laptop', getPageObject });

    const info = new CollectContent(`html`, { name: 'info', contentType: 'html' })

    root.addOperation(laptop);
    laptop.addOperation(info);
    
    await scraper.scrape(root);

    /**
     * Get prices of each laptop
     */
    console.log("GETTING PRICES");

    const firstData = await Promise.all(laptops.map(async (lap, index) => {
        const res = await axios.get(`https://carts-beta.tekoapis.com/api/v2/products/${lap.id}?terminal=phongvu&quantity=1`, {
            headers: {
                referer: "https://phongvu.vn/"
            }
        });
        console.log(`Getting price of id_${lap.id}: ${res.data.data.supplierRetailPrice}`);
        return {
            ...lap,
            price: res.data.data.supplierRetailPrice,
        }
    }))

    /**
     * Get product details
     */
    const secondData = await Promise.all(firstData.map(async (lap, index) => {
        const res = await cloudscraper.get(lap.address);
        const $ = cheerio.load(res);
        const text = $('script#__NEXT_DATA__').text();
        const dataNeeded = JSON.parse(text)?.props?.pageProps?.serverProduct?.product?.productDetail?.attributeGroups;

        console.log(`Get product details at ${lap.address}`);

        const data = {}
        dataNeeded.forEach((ele, idx) => {
            const value = ele?.value;
            switch(ele?.name) {
                case "Thương hiệu":
                    data.dong_may = value;
                    break;
                case "CPU":
                    data.cpu = value;
                    break;
                case "RAM":
                    data.ram = value;
                    break;
                case "Lưu trữ":
                    data.o_cung = value;
                    break;
                case "Màn hình":
                    const inch = value.split(`\"`)[0];
                    const size = value.split(`\(`)[1].split(`\)`)[0];

                    data.man_hinh = `${inch} inch`;

                    if (value.toLowerCase().search("qhd") > 0) data.do_phan_giai = `QHD (${size})`;
                    if (value.toLowerCase().search("hd") > 0) data.do_phan_giai = `HD (${size})`;
                    if (value.toLowerCase().search("fullhd") > 0 || value.toLowerCase().search("full hd") > 0) data.do_phan_giai = `FullHD (${size})`;
                    if (value.toLowerCase().search("2k") > 0) data.do_phan_giai = `2K (${size})`;
                    if (value.toLowerCase().search("4k") > 0) data.do_phan_giai = `4K (${size})`;
                    
                    break;
                case "Chip đồ họa":
                    data.card_man_hinh = value;
                    break;
                case "Kích thước":
                    data.kich_thuoc = value;
                    break;
                case "Khối lượng":
                    data.khoi_luong = value;
                    break;
                case "Pin":
                    data.pin = value;
                    break;
                case "Hệ điều hành":
                    data.he_dieu_hanh = value;
                    break;
                default:
                    break;
            }
        })

        return {
            ...lap,
            ...data,
        }
    }))

    /**
     * Modify data
     */
    const finalData = secondData.map(({ id, address, info, ...data }, _) => data)

    fs.writeFile('./phongvu.csv', JSON.stringify(finalData), (err) => {
        if (err) {
            console.log("Something went wrong!!!");
        }else{
            console.log("Save file successed");
        }
    });
        
})()