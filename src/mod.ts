import {container, DependencyContainer} from "tsyringe";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import {ILogger} from "@spt-aki/models/spt/utils/ILogger";
import {JsonUtil} from "@spt-aki/utils/JsonUtil";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ITraderAssort, ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { ITraderConfig, UpdateTime } from "@spt-aki/models/spt/config/ITraderConfig";
import { ILocaleGlobalBase } from "@spt-aki/models/spt/server/ILocaleBase";
import type {StaticRouterModService} from "@spt-aki/services/mod/staticRouter/StaticRouterModService";
import { TraderCallbacks } from "@spt-aki/callbacks/TraderCallbacks";
import type {DynamicRouterModService} from "@spt-aki/services/mod/dynamicRouter/DynamicRouterModService";
import { TraderController } from "@spt-aki/controllers/TraderController";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { TraderAssortHelper } from "@spt-aki/helpers/TraderAssortHelper";
import * as path from 'path';
import * as fs from 'fs';
import { stringify } from "querystring";
import { captureRejectionSymbol } from "events";
import { Traders } from "@spt-aki/models/enums/Traders";
class Mod implements IPostDBLoadMod, IPreAkiLoadMod {

    logger;
    traderCallbacks;
    DB;
    modPath: string = path.normalize(path.join(__dirname, '..'));
    modConfig;
    modConfigPrices;
    modInterKConfig;
    modInterKStock;
    TraderName;
    databaseServer;
    tables;
    traderBase;
    traderController;
    database;
    config;
    barterArray;
    traderConfig;
    timeUtil;
    configServer;
    Traders;
    traderAssortHelper;
    constructor() {}

    public preAkiLoad(container: DependencyContainer): void {
        this.logger = container.resolve < ILogger > ("WinstonLogger");
        this.traderCallbacks = container.resolve < TraderCallbacks > ("TraderCallbacks");
        this.modConfig = require("../config/config.json");
        this.TraderName = "Forgekeeper";
        this.databaseServer = container.resolve < DatabaseServer > ("DatabaseServer");
        this.tables = this.databaseServer.getTables();
        this.traderController = container.resolve < TraderController > ("TraderController");
        this.database = container.resolve<DatabaseServer>("DatabaseServer");
        this.config = container.resolve<ConfigServer>("ConfigServer");
        this.configServer = container.resolve<ConfigServer>("ConfigServer");
        this.barterArray = require(this.modPath + "/config/barter.json");
        this.traderConfig = this.configServer.getConfig(ConfigTypes.TRADER);
        this.timeUtil = container.resolve<TimeUtil>("TimeUtil");
        this.traderAssortHelper = container.resolve<TraderAssortHelper>("TraderAssortHelper");
        //Loading TraderBase


        if (this.modConfig.Disabled == false) {
        let traderBasePath = this.modPath + "/db/base/base.json";
        if (fs.existsSync(traderBasePath)) {
            this.traderBase = require(traderBasePath);
        } else {
            this.logger.error(this.TraderName + "required base.json missing in /db/base/");
        }

        const dynamicRouterModService = container.resolve<DynamicRouterModService>("DynamicRouterModService");
        const staticRouterModService = container.resolve<StaticRouterModService>("StaticRouterModService");
        let currentTime = this.timeUtil.getTimestamp()
        let time = currentTime + this.modConfig.TraderUpdateTimeInSec;
        dynamicRouterModService.registerDynamicRouter(
            "TraderGeneratorRouter",
            [
                {
                url: "/client/trading/api/getTraderAssort/",
                action: (url, info, sessionId, output) => {
                    let currentTime = this.timeUtil.getTimestamp();
                    let timeLeft = time - currentTime;
                    if (timeLeft < 0) {
                        this.traderAssortHelper.resetExpiredTrader(this.databaseServer.tableData.traders["Emporium"]);
                        this.databaseServer.tableData.traders["Emporium"].assort = this.genereateRandomizedBarterAssort()[0]
                        time = currentTime + this.modConfig.TraderUpdateTimeInSec;
                    }

                    return output;
                }
            }
        ],
        "aki"
        );

        this.logger.debug(`[${this.TraderName}] Loading... `);
        this.registerProfileImage(container);
        this.setupTraderUpdateTime(container);
        }
        

    }
    public postDBLoad(container: DependencyContainer): void {
        const databaseServer = container.resolve < DatabaseServer > ("DatabaseServer");
        const tables = databaseServer.getTables();
        const logger = container.resolve < ILogger > ("WinstonLogger");
        if (this.modConfig.Disabled == false) {
        logger.log("Loading Emporium ", "cyan");
        const jsonUtil = container.resolve < JsonUtil > ("JsonUtil");
        let DB = this.database.getTables()
        let items = DB.templates.items


        tables.traders[this.traderBase._id] = {
            assort: this.getAssort2(this.logger),
            base: jsonUtil.deserialize(jsonUtil.serialize(this.traderBase)) as ITraderBase
        };

        
        let dialoguePath = this.modPath + "/db/dialogue/dialogue.json";
        if (fs.existsSync(dialoguePath)) {
            tables.traders[this.traderBase._id].dialogue = require(dialoguePath);
        }

        let questassortPath = this.modPath + "/db/questassort/questassort.json";
        if (fs.existsSync(questassortPath)) {
            tables.traders[this.traderBase._id].questassort = require(questassortPath);
        }

        tables.traders[this.traderBase._id].base.loyaltyLevels[0].minLevel = this.modConfig.loyaltyLevels.minLevel1;
        tables.traders[this.traderBase._id].base.loyaltyLevels[1].minLevel = this.modConfig.loyaltyLevels.minLevel2;
        tables.traders[this.traderBase._id].base.loyaltyLevels[2].minLevel = this.modConfig.loyaltyLevels.minLevel3;
        tables.traders[this.traderBase._id].base.loyaltyLevels[3].minLevel = this.modConfig.loyaltyLevels.minLevel4;

        console.log(tables.traders[this.traderBase._id].base)

        const locales = Object.values(tables.locales.global) as ILocaleGlobalBase[];
        for (const locale of locales) {
            
            locale.trading[this.traderBase._id] = {
                FullName: this.traderBase.surname,
                FirstName: this.traderBase.name,
                Nickname: this.traderBase.nickname,
                Location: this.traderBase.location,
                Description: this.traderBase.description
            };
        }


        this.databaseServer.tableData.traders["Emporium"].assort = this.genereateRandomizedBarterAssort()[0]

        if (this.modConfig.crash == true) {
            this.crash()
        }

    }
    }
    public genereateRandomizedBarterAssort(){
        let assort = [{
            "items":[
            ],
            "barter_scheme":{
            },
            "loyal_level_items":{
            }
         }
        ];
        let assort1 = this.barterAssortLoop(this.modConfig.PriceRangeLL1)
        let assort2 = this.barterAssortLoop(this.modConfig.PriceRangeLL2)
        let assort3 = this.barterAssortLoop(this.modConfig.PriceRangeLL3)
        let assort4 = this.barterAssortLoop(this.modConfig.PriceRangeLL4)
        assort[0].items = assort1[0].items.concat(assort2[0].items,assort3[0].items,assort4[0].items)
        assort[0].barter_scheme = Object.assign(assort1[0].barter_scheme,assort2[0].barter_scheme,assort3[0].barter_scheme,assort4[0].barter_scheme)
        assort[0].loyal_level_items = Object.assign(assort1[0].loyal_level_items,assort2[0].loyal_level_items,assort3[0].loyal_level_items,assort4[0].loyal_level_items)
        return assort;
    }
    public barterAssortLoop(LL){
        let assort = [{
            "items":[
            ],
            "barter_scheme":{
            },
            "loyal_level_items":{
            }
         }
        ];
        for (let i = 0; i < LL.AssortCount * this.modConfig.AssortMultiplier; i++) {
            let item = this.weightedRandomBasedOnPrice(LL.MinPrice,LL.MaxPrice)
   
            let pricearray = require(this.modPath + "/config/prices.json")
            let price = pricearray[item]
            let ID = this.generateRandomHash()
        
            //check if the item is blacklisted or not
            while (this.modConfig.Blacklist_Items.includes(item)) {
                item = this.weightedRandomBasedOnPrice(LL.MinPrice,LL.MaxPrice);
            }
            while (this.getParent(item) == "5485a8684bdc2da71d8b4567") {
                item = this.weightedRandomBasedOnPrice(LL.MinPrice,LL.MaxPrice);
            }
            while (this.getParent(item) == "543be5cb4bdc2deb348b4568") {
                item = this.weightedRandomBasedOnPrice(LL.MinPrice,LL.MaxPrice);
            }
            //check if the item is not already in assort
            while (assort[0].items.some((e) => e._tpl == item)) {
                item = this.weightedRandomBasedOnPrice(LL.MinPrice,LL.MaxPrice);
            }


            let generatedCount
            const parentIds = [
                "5b3f15d486f77432d0509248",
                "5422acb9af1c889c16000029",
                "55818aeb4bdc2ddc698b456a",
                "550aa4af4bdc2dd4348b456e",
                "55818acf4bdc2dde698b456b",
                "5448bc234bdc2d3c308b4569",
                "5448e5284bdc2dcb718b4567",
                "57bef4c42459772e8d35a53b",
                "5448e53e4bdc2d60728b4567",
                "543be5e94bdc2df1348b4568",
                "5c99f98d86f7745c314214b3",
                "5c164d2286f774194c5e69fa",
                "5447b5cf4bdc2d65278b4567",
            "5447b5e04bdc2d62278b4567",
            "5447b5f14bdc2d61278b4567",
            "5447b5fc4bdc2d87278b4567",
            "5447b6094bdc2dc3278b4567",
            "5447b6194bdc2d67278b4567",
            "5447b6254bdc2dc3278b4568",
            "5447bed64bdc2d97278b4568",
            "5447bedf4bdc2d87278b4568",
            "5447bee84bdc2dc3278b4569",
            "555ef6e44bdc2de9068b457e",
            "5a341c4086f77401f2541505",
            "55818a594bdc2db9688b456a",
            "55818a104bdc2db9688b4569",
            "55818ac54bdc2d5b648b456e",
            "55818a304bdc2db5418b457d",
            "5a74651486f7744e73386dd1",
            "550aa4cd4bdc2dd8348b456c",
            "55818a684bdc2ddd698b456d"
            ];

            //if getparent of item is not included in parentids
            if (parentIds.includes(this.getParent(item))) {
                generatedCount = 1;
            }   else    {
                generatedCount = Math.floor(Math.random() * (LL.StockMax - LL.StockMin) + LL.StockMin);
            }

            let PriceMultiplierRange = Math.random() * (LL.PriceMultiplierRange.Max - LL.PriceMultiplierRange.Min) + LL.PriceMultiplierRange.Min;
            let prc = Math.floor(price * PriceMultiplierRange)
            let t1 = [{
                "items":[
                    {
                        "_id": ID,
                        "_tpl": item,
                        "parentId": "hideout",
                        "slotId": "hideout",
                        "upd": {
                            "StackObjectsCount": generatedCount,
                            "UnlimitedCount": false
                    }
                }
                ],
                "barter_scheme":{
                    "k43xg342gn":[
                      [
                         {
                            "count": prc,
                            "_tpl":"5449016a4bdc2d6f028b456f"
                         }
                      ]
                   ]
                },
                "loyal_level_items":{
                    "k43xg342gn":LL.LoyalLevel
                }
             }
            ];
            let t2 = JSON.stringify(t1).replaceAll("k43xg342gn", ID)
            let ParseJson = JSON.parse(t2)

            assort[0].items[i] = ParseJson[0].items[0]
            assort[0].barter_scheme[ID] = ParseJson[0].barter_scheme[ID]
            assort[0].loyal_level_items[ID] = ParseJson[0].loyal_level_items[ID]
        }
        return assort;
    }
    public weightedRandomBasedOnPrice(pricemin, pricemax) {
        let pricesArray = require(this.modPath + "/config/prices.json");
        let length = Object.keys(pricesArray).length;
        let item =  Object.keys(pricesArray)[Math.floor(Math.random() * length)];
        let price = pricesArray[item];
        if (price >= pricemin && price <= pricemax) {
            return item;
        }
        else {
            return this.weightedRandomBasedOnPrice(pricemin, pricemax);
        }
    }
    public getParent(item) {
        let DB = this.database.getTables()
        let items = DB.templates.items
        if (items[item] != undefined && items[item]._parent != undefined && items[item]._parent != "") {
            return items[item]._parent
        }
        else {
            return "nothing"
        }
    }
    public getWeightedInventoryItem(itemArray: { [tplId: string]: unknown; } | ArrayLike<unknown>): string
    {
        const itemKeys = Object.keys(itemArray);
        const weights = Object.values(itemArray);
        const chosenItem = this.weightedRandom(itemKeys, weights);

        return chosenItem.item;
    }
    public weightedRandom(items: string | any[], weights: string | any[]): { item: any; index: number; }
    {
        if (items.length !== weights.length)
        {
            throw new Error("Items and weights must be of the same size");
        }

        if (!items.length)
        {
            throw new Error("Items must not be empty");
        }

        const cumulativeWeights = [];
        for (let i = 0; i < weights.length; i += 1)
        {
            cumulativeWeights[i] = weights[i] + (cumulativeWeights[i - 1] || 0);
        }
        const maxCumulativeWeight = cumulativeWeights[cumulativeWeights.length - 1];
        const randomNumber = maxCumulativeWeight * Math.random();

        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1)
        {
            if (cumulativeWeights[itemIndex] >= randomNumber)
            {
                return {
                    item: items[itemIndex],
                    index: itemIndex
                };
            }
        }
    }
    public has_props(item) {
        let DB = this.database.getTables()
        let items = DB.templates.items
        if (items[item] != undefined && items[item]._props != undefined && items[item]._props != "" && Object.entries(items[item]._props).length > 5) {
            return true
        }
        else {
            return false
        }
    }
    public getItemsByNameReference(name) {
        let DB = this.database.getTables()
        let items = DB.templates.items
        let Array = []
        for (const item in items) {
            const itmLocale = this.getLocaleFromID(item)
            const stringified = JSON.stringify(itmLocale)
            if (itmLocale != undefined && stringified.includes(name)) {
                Array.push(item)
            }
        }
        return Array
    }
    public crash() {
        this.logger.error("Intentional crash")
        process.exit(0)
    }
    public generateRandomHash() {

        let hash = "";
        let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        hash += "k4_"
        for (let i = 0; i < 20; i++)
            hash += possible.charAt(Math.floor(Math.random() * possible.length));
            

        return hash;
    }
    public getParentName(ID) {
        let items = this.database.getTables().templates.items
        let parent = items[ID]._parent
        let parentName = items[parent]._name
        return parentName
    }
    public getLocaleFromID(ID) {
        const databaseServer = container.resolve < DatabaseServer > ("DatabaseServer");
        const database = databaseServer.getTables();
        const locales = database.locales.global
        let locale = locales["en"].templates[ID]
        return locale
    }
    public getName(ID) {
        let items = this.database.getTables().templates.items
        let name = items[ID]._name
        return name
    }
    public isRequired(ID, SlotID) {
        let items = this.database.getTables().templates.items
        let SlotsFromItem = items[ID]._props.Slots
        for (let i = 0; i < SlotsFromItem.length; i++) {
            let current = SlotsFromItem[i]
            let slotID = current._name
            if (slotID == SlotID) {
                if (current._required == true) {
                    return true
                }
            }
        }
        return false
    }
    private getAssort2(logger: ILogger): ITraderAssort {
        let assort: ITraderAssort = {
            items: [],
            barter_scheme: {},
            loyal_level_items: {}
        };
        let files = this.loadAssortFiles(this.modPath + "/db/assort/");
        let fileCount = files.length;

        if (fileCount == 0) {
            this.logger.error(this.TraderName + ": No Files in /db/assort/");
            return assort;
        }

        files.forEach(file => {
            assort = this.mergeAssorts(assort, file);
        });
        return assort;
    }
    private registerProfileImage(container: DependencyContainer): void {
        const resFolderPath = this.modPath + "/res/";

        // Register route pointing to the profile picture
        const imageRouter = container.resolve < ImageRouter > ("ImageRouter");
        //let filename =this.traderBase.avatar.replace(".jpg","");

        let fileExt = ".jpg";
        if (path.extname(this.traderBase.avatar) == ".png")
            fileExt = ".png";

        let fileName = path.basename(this.traderBase.avatar);

        imageRouter.addRoute(this.traderBase.avatar.replace(fileExt, ""), resFolderPath + fileName);
    }
    private setupTraderUpdateTime(container: DependencyContainer): void {
        const configServer = container.resolve < ConfigServer > ("ConfigServer");
        const traderConfig = configServer.getConfig < ITraderConfig > (ConfigTypes.TRADER);
        const traderRefreshConfig: UpdateTime = {
            traderId: this.traderBase._id,
            seconds: this.modConfig.TraderUpdateTimeInSec
        };
        traderConfig.updateTime.push(traderRefreshConfig);
    }

    private loadAssortFiles(filePath): Array < ITraderAssort > {
        const logger = container.resolve < ILogger > ("WinstonLogger");

        let fileNameList = fs.readdirSync(filePath);
        let fileList = [];
        fileNameList.forEach(fileName => {
            if (path.extname(fileName) == ".json") {
                let newFile = require(filePath + fileName) as ITraderAssort;
                fileList.push(newFile);
            }
        });
        return fileList;
    }

    private mergeAssorts(assort1: ITraderAssort,assort2: ITraderAssort): ITraderAssort{
		Object.values(assort2.items).map((item)=>{	
			assort1.items.push(item);
			if(item.parentId =="hideout"){  //check if its not part of a preset
				assort1.barter_scheme[item._id] = assort2.barter_scheme[item._id];
				assort1.loyal_level_items[item._id] = assort2.loyal_level_items[item._id];
			}				
		});		
		return assort1;
	}
}




module.exports = {
    mod: new Mod()
}
