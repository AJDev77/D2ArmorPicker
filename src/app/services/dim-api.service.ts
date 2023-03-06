import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Loadout } from "@destinyitemmanager/dim-api-types/loadouts";
import { ProfileResponse } from "@destinyitemmanager/dim-api-types/profile";
import { DestinyClass } from "bungie-api-ts/destiny2";
import { BehaviorSubject, Observable } from "rxjs";
import {environment} from "../../environments/environment";
import { ResultDefinition } from "../components/authenticated-v2/results/results.component";
import { BuildConfiguration } from "../data/buildConfiguration";
import { ArmorStat, SpecialArmorStat, STAT_MOD_VALUES } from "../data/enum/armor-stat";
import { ModifierType } from "../data/enum/modifierType";
import { ModOrAbility } from "../data/enum/modOrAbility";
import { ModInformation } from "../data/ModInformation";
import { AuthService } from "./auth.service";
import { BungieApiService } from "./bungie-api.service";
import { ConfigurationService } from "./configuration.service";
import { CustomItemService } from "./custom-item.service";
import { DatabaseService } from "./database.service";
import { StatusProviderService } from "./status-provider.service";

export interface DimConfiguration {
    build: BuildConfiguration;
    name: string;
    dimID: string;
    dimLastUpdated: number | undefined;
}

export interface DimStatCheckResult {
  maxTiers: number[],
  lowestModCost: number,
  armor: any[] //(TODO: make type)
}

  type info = {
  results: ResultDefinition[],
  totalResults: number,
  maximumPossibleTiers: number[],
  statCombo3x100: ArmorStat[][],
  statCombo4x100: ArmorStat[][],
  itemCount: number,
  totalTime: number,
};

// old general stat mod conversion
let modConversion = new Map<number, number>();
modConversion.set(204137529, 1703647492) //minor mobility
modConversion.set(3961599962, 4183296050) //major mobility
modConversion.set(3682186345, 2532323436) //minor resilience
modConversion.set(2850583378, 1180408010) //major resilience
modConversion.set(555005975, 1237786518) //minor recovery
modConversion.set(2645858828, 4204488676) //major recovery
modConversion.set(2623485440, 4021790309) //minor discipline
modConversion.set(4048838440, 1435557120) //major discipline
modConversion.set(1227870362, 350061697) //minor intellect
modConversion.set(3355995799, 2724608735) //major intellect
modConversion.set(3699676109, 2639422088) //minor strength
modConversion.set(3253038666, 4287799666) //major strength


@Injectable({
    providedIn: 'root'
  })

export class DimApiService {
    updating = false;

    dimLoadouts: Loadout[] = [];

    constructor(private auth: AuthService, private http: HttpClient, public config: ConfigurationService,
        public status: StatusProviderService, private bungieAPI: BungieApiService, private db: DatabaseService,
        private customItems: CustomItemService) {
            this._armorResults = new BehaviorSubject({
                results: this.allArmorResults
              } as info)
              this.armorResults = this._armorResults.asObservable();
    }

    async autoRegenerateTokens() {
        const timing = 1000 * 3600 * 24; // every day
        console.log("DIM autoRegenerateTokens", {
          token: this.dimAccessToken,
          datenow: Date.now(),
          refreshTokenExpiringAt: this.dimRefreshExpiringAt,
          lastRefresh: this.lastRefresh,
          "Date.now() > (this.lastRefresh + timing)": Date.now() > (this.lastRefresh + timing),

        } )

        if (this.dimAccessToken
          && Date.now() < this.dimRefreshExpiringAt
          && Date.now() > (this.lastRefresh + timing)) {
          return await this.generateTokens()
        } else if (!this.dimAccessToken) {
          console.log("Auto refresh when don't have auth token, trying to get...")
          this.generateTokens()
        }
        return true;
      }

    async generateTokens(): Promise<boolean> {
        console.info("Generate auth tokens", "generating DIM tokens");
        const DIM_API_KEY = environment.dimAPIKey;
        const BUNGIE_AUTH = this.auth.accessToken;
        const MEMBERSHIP_ID = this.auth.membershipId;

        return await this.http.post<any>(`https://api.destinyitemmanager.com/auth/token`,
    `{"bungieAccessToken":"${BUNGIE_AUTH}","membershipId":"${MEMBERSHIP_ID}"}`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "" + DIM_API_KEY,
        }
      }).toPromise()
      .then(value => {
        console.log("DIM API AUTH TOKEN", value)
        this.dimAccessToken = value.accessToken;
        this.dimRefreshExpiringAt = Date.now() + (value.expiresInSeconds * 1000)
        this.lastRefresh = Date.now()
        return true;
      })
      .catch(async err => {
        console.log({err});
        this.dimAccessToken = null;
        //await this.auth.logout();
        return false;
      })
    }

    get dimRefreshExpiringAt(): number {
        let l = localStorage.getItem("dimRefreshExpiringAt") || "0";
        return l ? Number.parseInt(l) : 0;
      }

      set dimRefreshExpiringAt(newCode: number | null) {
        if (!newCode) {
          console.info("Clearing dim refresh expiration")
          localStorage.removeItem("dimRefreshExpiringAt");
        } else {
          console.info("Setting new dim refresh expiration")
          localStorage.setItem("dimRefreshExpiringAt", "" + newCode)
        }
      }

    isAuthenticated() {
        return !!this.dimAccessToken;
      }

    get dimAccessToken() {
        return localStorage.getItem("dimAccessToken");
      }

      set dimAccessToken(newCode: string | null) {
        if (!newCode) {
          console.info("Clearing DIM access token")
          localStorage.removeItem("dimAccessToken");
        } else {
          console.info("Setting new DIM access token")
          localStorage.setItem("dimAccessToken", "" + newCode)
        }
      }

      get lastRefresh(): number {
        let l = localStorage.getItem("dimLastRefresh") || "0";
        return l ? Number.parseInt(l) : 0;
      }

      set lastRefresh(newCode: number | null) {
        if (!newCode)
          localStorage.removeItem("dimLastRefresh");
        else
          localStorage.setItem("dimLastRefresh", newCode.toString())
      }

      async getDimLoadouts() {
        if (!this.isAuthenticated()) {
            console.log("DIM API", "Auto refresh due to trying to get loadout when not auth'd")
            await this.generateTokens();
        }
        this.updating = true;
        if (!this.status.getStatus().updatingInventory && !this.status.getStatus().updatingManifest && !this.status.getStatus().updatingResultsTable) {
          await this.bungieAPI.getMembershipDataForCurrentUser().then(async (result) => {
            let dimLoadoutsURL = `https://api.destinyitemmanager.com/profile?&platformMembershipId=${result?.membershipId}&destinyVersion=2&components=loadouts`;
            await this.http.get<ProfileResponse>(dimLoadoutsURL, {
              headers: {
                "Authorization": "Bearer " + this.dimAccessToken,
                "X-API-Key": "" + environment.dimAPIKey,
              }}).toPromise().then(async value => {
                console.log("**LOADOUTS FROM DIM!**", value);
                this.dimLoadouts = value.loadouts!;
                this.convertLoadoutsFromDIM();
                return true;
              }).catch(async err => {
                console.error(err);
                console.log("Error fetching dim loadouts")
                this.dimAccessToken = null;
                this.updating = false;
              });
      })
      } else {
        // var start = performance.now()
        // var end;
        let updateNext = false;
        let sub = this.status.status.subscribe(
             value => {
                if (value.updatingInventory == true) {
                    console.log("DIM API Service", "Saw inventory updating, waiting")
                    updateNext = true;
                } else if (value.updatingResultsTable == false && value.calculatingPermutations == false && updateNext == true) {
                    console.log("DIM API Service", "Inv update done, getting loadouts")
                    sub.unsubscribe();
                    this.getDimLoadouts();
                }
             }
         )
      }
      }

      async convertLoadoutsFromDIM() {
        var wholeStartTime = performance.now()
        const codingObject = await this.db.inventoryArmor.toArray();
        var testBuilds = [];
        let oldDIMIDs = this.config.listDimIDs()


        // replace with other one so both can get updated at once
        let subclass = new Map<number, ModifierType>([
          [873720784, ModifierType.Stasis],
          [2453351420, ModifierType.Void],
          [2240888816, ModifierType.Solar],
          [2328211300, ModifierType.Arc],
          [3785442599, ModifierType.Strand],

          [613647804, ModifierType.Stasis],
          [2842471112, ModifierType.Void],
          [2550323932, ModifierType.Solar],
          [2932390016, ModifierType.Arc],
          [242419885, ModifierType.Strand],

          [3291545503, ModifierType.Stasis],
          [2849050827, ModifierType.Void],
          [3941205951, ModifierType.Solar],
          [3168997075, ModifierType.Arc],
          [4204413574, ModifierType.Strand]
        ])
        for (let value of this.dimLoadouts) {
            var index = oldDIMIDs.indexOf(value.id);
            if (index !== -1) {
                console.log("Removing config ", oldDIMIDs[index])
                oldDIMIDs.splice(index, 1);
            }
            // If loadout didn't change, don't rebuild it
            // if (this.config.doesDimConfigurationExist(value.name, value.id, value.lastUpdatedAt)) {
            //     console.log("Loadout detect", "Found unchanged loadout ", value.name)
            //     continue;
            // // If the name changed, still rebuild since we can't tell that only the name changed
            // } else
            if (this.config.didDimNameChange(value.id, value.name)) {
                console.log("Loadout detect", "name changed")
                this.config.deleteDimConfigurationByID(value.id)
            }
          // TODO: Make sure stat doesn't go below 0
          let mobility = 0;
          let resilience = 0;
          let recovery = 0;
          let discipline = 0;
          let intellect = 0;
          let strength = 0;
          let exoticHash = 0;
          let specialMods: ModOrAbility[] = [];
          let testBuild = BuildConfiguration.buildEmptyConfiguration();


          testBuild.characterClass = value.classType.valueOf();

          for (let element of value.equipped) {
            let currItem = codingObject.find((v) => v.itemInstanceId == element.id!)

            if (currItem != undefined) {
              // could check if socketOverrides exists, but then wouldn't fail nicely for new subclasses
              if (subclass.has(element.hash)) {
                testBuild.selectedModElement = subclass.get(element.hash)!;
                Object.values(element.socketOverrides!).forEach(subMod => {
                  Object.values(ModInformation).forEach(modValue => {
                    if (subMod == modValue.hash) {
                        modValue.bonus.forEach(bonus => {
                        if (bonus.stat == ArmorStat.Mobility) {
                          mobility += bonus.value
                        } else if (bonus.stat == ArmorStat.Resilience) {
                          resilience += bonus.value
                        } else if (bonus.stat== ArmorStat.Recovery) {
                          recovery += bonus.value
                        } else if (bonus.stat == ArmorStat.Discipline) {
                          discipline += bonus.value
                        } else if (bonus.stat == ArmorStat.Intellect) {
                          intellect += bonus.value
                        } else if (bonus.stat == ArmorStat.Strength) {
                          strength += bonus.value
                        } else if (bonus.stat == SpecialArmorStat.ClassAbilityRegenerationStat) {
                          if (value.classType == DestinyClass.Titan) {
                            resilience += bonus.value
                          } else if (value.classType == DestinyClass.Warlock) {
                            recovery += bonus.value
                          } else if (value.classType == DestinyClass.Hunter) {
                            mobility += bonus.value
                          }
                        }
                      })
                      specialMods.push(modValue.id);
                    }
                  })
                })
              } else {
                    let bonus = 0;
                    if (currItem.masterworked) {
                      bonus = 2;
                    }
                    mobility = mobility + currItem.mobility + bonus;
                    resilience = resilience + currItem.resilience + bonus;
                    recovery = recovery + currItem.recovery + bonus;
                    discipline = discipline + currItem.discipline + bonus;
                    intellect = intellect + currItem.intellect + bonus;
                    strength = strength + currItem.strength + bonus;
                    if (currItem.isExotic) {
                      exoticHash = currItem.hash;
                     }
                }
            }
          }


          if (value.parameters?.mods != undefined) {
          for (let mod of value.parameters?.mods) {
            let modHash: number = mod;
            let modConvert = modConversion.get(modHash);
            if (modConvert != undefined) {
              modHash = modConvert;
            }
            // FIND GENERAL STAT MODS
            let foundMod = Object.values(STAT_MOD_VALUES).find((v) => v[3] == modHash)
        
            if (foundMod != undefined) {
              if (foundMod[0] == ArmorStat.Mobility) {
                mobility += foundMod[1]
              } else if (foundMod[0] == ArmorStat.Resilience) {
                resilience += foundMod[1]
              } else if (foundMod[0] == ArmorStat.Recovery) {
                recovery += foundMod[1]
              } else if (foundMod[0] == ArmorStat.Discipline) {
                discipline += foundMod[1]
              } else if (foundMod[0] == ArmorStat.Intellect) {
                intellect += foundMod[1]
              } else if (foundMod[0] == ArmorStat.Strength) {
                strength += foundMod[1]
              }
              // this mod was general, so skip checking it further
              continue;
            }
            //}

            // FIND SPECIAL MODS
            // Powerful friends/radiant light issue:
            // DIM doesn't provide where a mod is located (for the most part),
            // so without complex logic to determine if there could possibly be
            // an arc mod on the same armor piece, it's hard to detect.
            // Therefore, if a user has one of those mods on, it will give them
            // the stat boost regardless.

            let specialMod = Object.values(ModInformation).find((v) => v.hash == modHash)

            if (specialMod != undefined) {
                specialMods.push(specialMod.id)
                specialMod.bonus.forEach(bonus => {
                    if (bonus.stat == ArmorStat.Mobility) {
                      mobility += bonus.value
                    } else if (bonus.stat == ArmorStat.Resilience) {
                      resilience += bonus.value
                    } else if (bonus.stat== ArmorStat.Recovery) {
                      recovery += bonus.value
                    } else if (bonus.stat == ArmorStat.Discipline) {
                      discipline += bonus.value
                    } else if (bonus.stat == ArmorStat.Intellect) {
                      intellect += bonus.value
                    } else if (bonus.stat == ArmorStat.Strength) {
                      strength += bonus.value
                    } else if (bonus.stat == SpecialArmorStat.ClassAbilityRegenerationStat) {
                      if (value.classType == DestinyClass.Titan) {
                        resilience += bonus.value
                      } else if (value.classType == DestinyClass.Warlock) {
                        recovery += bonus.value
                      } else if (value.classType == DestinyClass.Hunter) {
                        mobility += bonus.value
                      }
                    }
                  })
            }

            // placeholder for artifice mods
            if (mod == 2322202118) {
              mobility += 3;
            } else if (mod == 199176566) {
              resilience += 3;
            } else if (mod == 539459624) {
              recovery += 3
            } else if (mod == 617569843) {
              discipline += 3
            } else if (mod == 3160845295) {
              intellect += 3
            } else if (mod == 2507624050) {
              strength += 3
            }
          }
        }
          // Finally
          // gets stats from armor, including masterwork
          testBuild.minimumStatTiers[ArmorStat.Mobility].value = Math.floor(mobility / 10);
          testBuild.minimumStatTiers[ArmorStat.Resilience].value = Math.floor(resilience / 10);
          testBuild.minimumStatTiers[ArmorStat.Recovery].value = Math.floor(recovery / 10);
          testBuild.minimumStatTiers[ArmorStat.Discipline].value = Math.floor(discipline / 10);
          testBuild.minimumStatTiers[ArmorStat.Intellect].value = Math.floor(intellect / 10);
          testBuild.minimumStatTiers[ArmorStat.Strength].value = Math.floor(strength / 10);
          // gets the exotic used, if any
          testBuild.selectedExotics.push(exoticHash);
          // adds special mods
          testBuild.enabledMods = specialMods;

          var test: DimConfiguration = {build: testBuild, name: value.name, dimID: value.id, dimLastUpdated: value.lastUpdatedAt};
          testBuilds.push(test);
        }
        var startTime = performance.now();
        // testbuilds empty when loadouts havent changed
        for (let i = 0; i < testBuilds.length; i++) {
            this.config.saveConfiguration(testBuilds[i].name, testBuilds[i].build, true, testBuilds[i].dimID, testBuilds[i].dimLastUpdated);
        }
        oldDIMIDs.forEach((v) => this.config.deleteDimConfigurationByID(v))
        var endTime = performance.now();
        console.log(`adding/removing loadouts took ${endTime - startTime} milliseconds`)
        var wholeEndTime = performance.now()
        console.log(`****total loadout build took ${wholeEndTime - wholeStartTime} milliseconds`)
        this.updating = false;
    }

    private _armorResults: BehaviorSubject<info>;
    public readonly armorResults: Observable<info>;
    private allArmorResults: ResultDefinition[] = [];


    // Start experimental auto refresh
    checkLoadoutStats(nthreads: number = 3, loadout: BuildConfiguration) {
        return new Promise<DimStatCheckResult>((resolve, reject) => {
        try {
            console.time("autoRefresh loadouts with WebWorker")
            let doneWorkerCount = 0;

            let results: any[] = []
            let totalPermutationCount = 0;
            let resultMaximumTiers: number[][] = []
            const startTime = Date.now();

            for (let n = 0; n < nthreads; n++) {
              const worker = new Worker(new URL('./results-builder.worker', import.meta.url));
              worker.onmessage = ({data}) => {
                results.push(data.results)
                if (data.done == true) {
                  doneWorkerCount++;
                  totalPermutationCount += data.stats.permutationCount;
                  console.log("PUSHED", data.runtime.maximumPossibleTiers)
                  resultMaximumTiers.push(data.runtime.maximumPossibleTiers)
                }
                if (data.done == true && doneWorkerCount == nthreads) {
                  let endResults = []
                  for (let result of results) {
                    endResults.push(...result)
                  }

                  let maxTier: number[] = resultMaximumTiers.reduce((p, v) => {
                      for (let k = 0; k < 6; k++)
                          if (p[k] < v[k])
                              p[k] = v[k];
                      return p;
                  }, [0, 0, 0, 0, 0, 0]).map(k => Math.floor(Math.min(100, k) / 10))

                  //find lowest mod cost
                  let lowestCost: number = Infinity;
                  //let usesLimited: boolean = false;
                  for (let i = 0; i < data.results.length; i++) {
                    if (data.results[i].modCost < lowestCost) {
                      lowestCost = data.results[i].modCost;
                    }
                    // for (let items of data.results[i].items) {
                    //     console.log("DIM", this.customItems.customItems, items[0].name)
                    //     if (this.customItems.customItems.find((e) => e.name === items[0].name) != undefined) {
                    //       usesLimited = true;
                    //     }
                    // }
                  }

                  resolve({maxTiers: maxTier, lowestModCost: lowestCost, armor: data.results});

                  this._armorResults.next({
                      results: endResults,
                      totalResults: totalPermutationCount,
                      itemCount: data.stats.itemCount,
                      totalTime: Date.now() - startTime,
                      maximumPossibleTiers: resultMaximumTiers.reduce((p, v) => {
                          for (let k = 0; k < 6; k++)
                              if (p[k] < v[k])
                                  p[k] = v[k];
                          return p;
                      }, [0, 0, 0, 0, 0, 0]).map(k => Math.floor(Math.min(100, k) / 10)),
                      statCombo3x100: [],
                      statCombo4x100: []
                  })
                  console.log("AFTER END REsULTS: ", this._armorResults)
                  console.timeEnd("autoRefresh loadouts with WebWorker")
                  worker.terminate();
                } else if (data.done == true && doneWorkerCount != nthreads)
                  worker.terminate();
              };
              worker.onerror = ev => {
                console.error("ERROR IN WEBWORKER, TERMINATING WEBWORKER", ev);
                worker.terminate()
                reject("error in worker")
              }
              worker.postMessage({
                currentClass: loadout.characterClass,
                config: loadout,
                customItems: this.customItems.getCustomItems(),
                threadSplit: {
                  count: nthreads,
                  current: n
                }
              });
            }
          } finally {
          }
        })

      }
      getModCost(loadoutID: string): number {
        let modCost: number = 0;
        let loadout = this.dimLoadouts.find(e => e.id == loadoutID)
        if (loadout != undefined) {
          if (loadout.parameters?.mods != undefined) {
            for (let mod of loadout.parameters?.mods) {
              let foundMod = Object.values(STAT_MOD_VALUES).find((v) => v[3] == mod)
          
              if (foundMod != undefined) {
                  modCost += foundMod[2]
              }
            }
        }
      }
      return modCost
    }
}
