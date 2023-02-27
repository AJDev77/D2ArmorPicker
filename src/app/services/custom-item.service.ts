import { Injectable } from "@angular/core";
import { UntypedFormBuilder } from "@angular/forms";
import { DestinyEnergyType, DestinyVendorResponse } from "bungie-api-ts/destiny2";
import { Subject } from "rxjs";
import { IInventoryArmor } from "../data/types/IInventoryArmor";
import { BungieApiService } from "./bungie-api.service";
import { ConfigurationService } from "./configuration.service";
import { DatabaseService } from "./database.service";

export interface vendorArmorResponse {
    nextRefresh: Date,
    items: IInventoryArmor[]
  }

@Injectable({
    providedIn: 'root'
  })

export class CustomItemService {
    ob: Subject<IInventoryArmor[]> = new Subject<IInventoryArmor []>();
    customItems: IInventoryArmor[] = [];
    vendorArmor = new Map<string, vendorArmorResponse>();
    constructor(private config: ConfigurationService, private db: DatabaseService, private api: BungieApiService) {
        console.log("Vendors: new insrtance of custom items")
    }

    async refreshXurArmor() {
      let vendorAvailable = true;
        if (localStorage.getItem("vendorArmor") != null) {
            this.vendorArmor = new Map(Object.entries(JSON.parse(localStorage.getItem("vendorArmor")!)));
            let xur = this.vendorArmor.get("2190858386");
            if (xur != undefined) {
                if (new Date(xur.nextRefresh) > new Date(Date.now())) {
                    // shouldn't need to refresh
                    console.log("Vendors: don't need to refresh", xur.nextRefresh, " ", new Date(Date.now()))
                    this.customItems = xur.items;
                    Promise.resolve();
                    return;
                }
            }
        }
        console.log("Vendors: need to refresh")
        this.customItems = [];

      //let character = this.config.readonlyConfigurationSnapshot.characterClass;
      let characters = await this.api.getCharacters().catch(e => {
        return;
      })

      let charArray: string[] = []
      characters!.forEach(element => {
        charArray.push(element.characterId);
     });
      let refreshDate: Date;
      await Promise.all(charArray.map(charID => this.api.getVendor(charID, 2190858386))).then(async result => {
       refreshDate = new Date(result[0].vendor.data!.nextRefreshDate)
       await Promise.all(result.map(test => this.convertVendorResponse(test))).then(result => {
         result.forEach(element => {
          element.forEach(armor => {
            if (this.customItems.find(e => e.hash == armor.hash) == undefined) {
              this.customItems.push(armor);
            }
          })
           //this.customItems.push(...element);
         });
       });
     })
     .catch(e => {
       console.log("Vendor unavailable: ", e)
       vendorAvailable = false;
      })
  
      //remove duplicates
      //this.customItems = [...new Set(this.customItems)];
      if (vendorAvailable) {
        let res: vendorArmorResponse = {nextRefresh: refreshDate!, items: this.customItems}
        this.vendorArmor.set("2190858386", res)
        localStorage.setItem("vendorArmor", JSON.stringify(Object.fromEntries(this.vendorArmor)));
        this.ob.next(this.customItems);
      }
    }

    async convertVendorResponse(res: DestinyVendorResponse): Promise<IInventoryArmor[]> {
      // wait for manifest to load, find way to not remake every time?
      let manifestArmor = await this.db.manifestArmor.toArray();
      let res2 = Object.fromEntries(manifestArmor.map((_) => [_.hash, _]))

      let result: IInventoryArmor[] = [];
      for (let item of Object.entries(res.itemComponents.stats.data!)) {
        let stats = Object.values(item[1].stats)
        if (stats.findIndex(v => v.statHash == 392767087) != -1) {
          let test = res.sales.data![item[0]]
          console.log("Vendor res", test.itemHash)
          let testItem: IInventoryArmor = {
            id: 0,
            itemInstanceId: '',
            masterworked: false,
            mayBeBugged: false,
            mobility: stats.find(v => v.statHash == 2996146975)!.value,
            resilience: stats.find(v => v.statHash == 392767087)!.value,
            recovery: stats.find(v => v.statHash == 1943323491)!.value,
            discipline: stats.find(v => v.statHash == 1735777505)!.value,
            intellect: stats.find(v => v.statHash == 144602215)!.value,
            strength: stats.find(v => v.statHash == 4244567218)!.value,
            energyLevel: 0,
            energyAffinity: DestinyEnergyType.Any,
            statPlugHashes: [],
            hash: test.itemHash,
            name: res2[test.itemHash].name + " (at Xur)",
            icon: res2[test.itemHash].icon,
            description: res2[test.itemHash].description,
            watermarkIcon: res2[test.itemHash].watermarkIcon,
            slot: res2[test.itemHash].slot,
            clazz: res2[test.itemHash].clazz,
            perk: res2[test.itemHash].perk,
            isExotic: res2[test.itemHash].isExotic,
            rarity: res2[test.itemHash].isExotic,
            exoticPerkHash: res2[test.itemHash].exoticPerkHash,
            armor2: res2[test.itemHash].armor2,
            isSunset: res2[test.itemHash].isSunset,
            itemType: res2[test.itemHash].itemType,
            itemSubType: res2[test.itemHash].itemSubType,
            investmentStats: res2[test.itemHash].investmentStats
          }
          result.push(testItem);
        }
        //if (item[1].stats)
      }
      return result;
    }

    // doVendorsNeedRefresh(): boolean {
    //   if (localStorage.getItem("vendorArmor") != null) {
    //     this.vendorArmor = new Map(Object.entries(JSON.parse(localStorage.getItem("vendorArmor")!)));
    //     let xur = this.vendorArmor.get("2190858386");
    //     if (xur != undefined) {
    //         if (new Date(xur.nextRefresh) > new Date(Date.now())) {
    //         }
    //       }
    //     } else {
    //       return false;
    //     }
    // }
  }