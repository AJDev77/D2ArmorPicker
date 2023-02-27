import {Component, OnDestroy, OnInit} from '@angular/core';
import {ConfigurationService, StoredConfiguration} from "../../../../services/configuration.service";
import {UntypedFormBuilder, UntypedFormGroup} from "@angular/forms";
import {MatDialog} from "@angular/material/dialog";
import {ConfirmDialogComponent, ConfirmDialogData} from "../../components/confirm-dialog/confirm-dialog.component";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Subject} from "rxjs";
import {Clipboard} from "@angular/cdk/clipboard";
import {StatusProviderService} from "../../../../services/status-provider.service";
import { DimApiService, DimConfiguration, DimStatCheckResult } from 'src/app/services/dim-api.service';
import { ArmorStat } from 'src/app/data/enum/armor-stat';
import { FixableSelection } from 'src/app/data/buildConfiguration';
import { EnumDictionary } from 'src/app/data/types/EnumDictionary';
import { CustomItemService } from 'src/app/services/custom-item.service';

export interface dimHigherResult {
  id: string,
  result: number[],
  maxTiers: number[],
  modCost: number,
  higher: boolean,
  seen: boolean, 
  usesLimitedArmor: boolean,
  init: boolean
}

export interface seenLoadout {
  id: string,
  sawTiers: number[],
  sawModCost: number,
  lastUpdated: number
}

export interface dimConfiguration {
  disabledLoadouts: string[]
  seenLoadouts: seenLoadout[]
}

export interface loadoutWrapper {
  storedConfig: StoredConfiguration,
  higherResult: dimHigherResult
}

@Component({
  selector: 'load-dim-settings',
  templateUrl: './load-and-save-settings.component.html',
  styleUrls: ['./load-and-save-settings.component.css']
})

export class LoadDimSettingsComponent implements OnInit, OnDestroy {
  selectedEntry: string = "";
  checkingLoadout: string = ""
  progressText: string = "Unavailable"
  checkingStats: boolean = false
  storedConfigs: StoredConfiguration[] = [];
  //improvedLoadouts: dimHigherResult[] = [];
  loadoutWrap: loadoutWrapper[] = [];
  displayedColumns = ["name", "class", "mobility", "resilience", "recovery", "discipline", "intellect", "strength", "improve", "delete"];

  settingsNameForm: UntypedFormGroup;
  importTextForm: UntypedFormGroup;

  dimConfig: dimConfiguration;

  testing: boolean = false;


  constructor(public config: ConfigurationService, private formBuilder: UntypedFormBuilder,
              public dialog: MatDialog, private _snackBar: MatSnackBar, private clipboard: Clipboard,
              private dimAPI: DimApiService, public status: StatusProviderService, private custom: CustomItemService) {
    this.settingsNameForm = this.formBuilder.group({name: [null,]});
    this.importTextForm = this.formBuilder.group({content: [null,]});
    this.dimConfig = this.loadDimConfig();
  }

  ngOnInit(): void {
    this.config.storedConfigurations
      .subscribe(d => this.updateConfigs(d));
      this.dimAPI.getDimLoadouts();
}

  updateConfigs(newConfig: StoredConfiguration[]) {
    this.storedConfigs = newConfig
    this.loadoutWrap = []
    for (let config of newConfig) {
      let higher: dimHigherResult = {id: config.dimID!, result: [], maxTiers: [], modCost: 0, higher: false, seen: false, init: false, usesLimitedArmor: false}
      let wrap: loadoutWrapper = {storedConfig: config, higherResult: higher}
      this.loadoutWrap.push(wrap)
    }
  }

  getDimStatus(): boolean {
    return this.checkingStats || this.dimAPI.updating;
  }

  isDimConnected(): boolean {
    return this.dimAPI.isAuthenticated()
  }

  async updateDim() {
    //this.improvedLoadouts = []
    this.dimAPI.getDimLoadouts();
  }

  disableLoadout(loadoutID: string) {
    let element = this.storedConfigs.find((v) => v.dimID == loadoutID)
    if (element !== undefined) {
      element.disabled = true;
    }
  }

  getCheckingLoadout(): string {
    return this.checkingLoadout;
  }

  /**
   * Checks if a specific loadout has improvements
   * @param loadoutID the id of the loadout
   * @returns 0 if no improvement, 
   *          1 if improvement, 
   *          2 if improvement but already seen
   */
  // canLoadoutImprove(loadoutID: string): number {
  //   let loadout = this.improvedLoadouts.find((e) => e.id === loadoutID && e.higher == true)
  //   let actualLoadout = this.storedConfigs.find((e) => e.dimID === loadoutID)
  //   let seenLoadout = this.dimConfig.seenLoadouts.find((e) => e.id === loadoutID)
  //   let higherResult = this.improvedLoadouts.find((e) => e.id === loadoutID)
  //   console.log("DIM Checking loadout improv", actualLoadout?.name)
  //   if (seenLoadout != undefined) {
  //     if (seenLoadout.lastUpdated != new Date(actualLoadout?.dimLastUpdated!)) {
  //       this.dimConfig.seenLoadouts.splice(this.dimConfig.seenLoadouts.findIndex((e) => e.id === loadout?.id), 1)
  //       console.log("DIM date doesnt match")
  //     }
  //   }

  //   if (loadout != undefined) {
  //     if (seenLoadout != undefined) {
  //       let changed = false;
  //       for (let i = 0; i < 6; i++) { // NEED MAX FROM CURRENT CALCULATED
  //         if (seenLoadout.sawTiers[i as ArmorStat].value != actualLoadout!.configuration.minimumStatTiers[i as ArmorStat].value + higherResult!.result[i]) {
  //           console.log("DIM stat diff")
  //           return 1;
  //         }
  //       }
  //       console.log("DIM seen")
  //       return 2;
  //     } else {
  //       console.log("DIM not in")
  //       return 1;
  //     }
  //   }
  //   return 0;
  // }

  // getCheckedLoadout(loadoutID: string): dimHigherResult | undefined {
  //   return this.improvedLoadouts.find((e) => e.id === loadoutID)
  // }

  // hasLoadoutBeenChecked(loadoutID: string): boolean {
  //   if (this.improvedLoadouts.find(function (element) {
  //     return element.id === loadoutID;
  //   }) !== undefined) {
  //     return true;
  //   }
  //   return false;
  // }

  howCanLoadoutImprove(loadoutID: string): string {
    let stats = ["Mobility", "Resilience", "Recovery", "Discipline", "Intellect", "Strength"];
    let element = this.loadoutWrap.find(function (element) {
      return element.storedConfig.dimID === loadoutID})!
    let result: string = ""
    let origModCost = this.dimAPI.getModCost(loadoutID)
    let seenLoadout = this.dimConfig.seenLoadouts.find((e) => e.id === loadoutID)

    if (!element.higherResult.seen && seenLoadout != undefined) {
      result = result + "This result includes an difference to what\nyou have marked as seen before.\nClick to remove previous seen mark."
    }
    if (result !== "") {
      result = result + " \n"
    }
    result = result + "Difference from current loadout:"
    if (element.higherResult.modCost < origModCost) {
      //console.log("DIM Modcost", element.higherResult.modCost, origModCost)
      if (result !== "") {
        result = result + " \n"
      }
      result = result + "Modcost: " + (element.higherResult.modCost - origModCost)
    }

    for (let i = 0; i < element.higherResult.result.length; i++) {
      if (element.higherResult.result[i] !== undefined) {
        if (result !== "") {
          result = result + " \n"
        }
        // if (i != 0) {
        //   result = result + " ";
        // }
        result = result + stats[i] + ": +" + element.higherResult.result[i]
        // if (i != element.higherResult.result.length - 1) {
        //   result = result + " / "
        // }
      }
    }
    return result;
  }

  async checkArmorImprovement(loadoutID: string) {
    this.checkingLoadout = loadoutID
    let existing = this.loadoutWrap.find((v) => v.storedConfig.dimID == loadoutID);
    // if (existing != -1) {
    //   this.improvedLoadouts.splice(existing, 1);
    // }
    //let loadout = this.getDimItems().find((v) => v.dimID == loadoutID)
    await this.dimAPI.checkLoadoutStats(1, existing?.storedConfig.configuration!).then((v) => {
      console.log("PROMISED RESULT: ", v)
      let higherResult = this.checkIfHigher(existing?.storedConfig!, v);
      //if (higherResult.higher) {
      existing!.higherResult = higherResult;
      //}
      //num++;
      console.log("TESTING", existing?.storedConfig.name, " is ", higherResult);
    })
    this.checkingLoadout = ""
  }

  async checkAllArmorImprovement() {
    this.checkingStats = true;
    this.updateConfigs(this.storedConfigs);
    let loadouts = this.getDimItemsEnabled();
    let num = 0;
    //document.getElementById("progress")!.hidden = false;
     for (let loadout of loadouts) {
        this.progressText = "Progress: " + num +"/" + loadouts.length
      //console.log("TESTING: ", loadout)
        await this.checkArmorImprovement(loadout.storedConfig.dimID!)
        num++;
     }
     this.progressText = "Unavailable"
     this.checkingStats = false;

     //document.getElementById("progress")!.hidden = true;
  }

  checkIfHigher(loadout: StoredConfiguration, stats: DimStatCheckResult): dimHigherResult {
    let result: dimHigherResult = {higher: false, id: loadout.dimID!, result: [], modCost: stats.lowestModCost, maxTiers: stats.maxTiers, seen: false, init: true, usesLimitedArmor: false}
    let realModCost = this.dimAPI.getModCost(loadout.dimID!);
    
    if (stats.lowestModCost < realModCost) {
      result.higher = true
    }

    let actualTiers : number[] = []

    for (let i = 0; i < stats.maxTiers.length; i++) {
      actualTiers[i] = loadout.configuration.minimumStatTiers[i as ArmorStat].value
      if (stats.maxTiers[i] > loadout.configuration.minimumStatTiers[i as ArmorStat].value) {
        result.higher = true;
        result.result[i] = stats.maxTiers[i] - loadout.configuration.minimumStatTiers[i as ArmorStat].value
      }
    }

    for (let i = 0; i < stats.armor.length; i++) {
      for (let j = 0; j < stats.armor[i].items.length; j++) {
        stats.armor[i].items[j] = stats.armor[i].items[j][0]
      }
    }
    //console.log("DIM AMOR", stats.armor)
    //let limtiedResults = stats.armor.filter((e) => e.items.filter((j) => j[0].name == 2))

    // show red if: results in loadout
    //                      (with lower mod cost
    //                      or higher stat tiers)
    //                      and user doesn't have any other non-limited armor to get that lower mod cost/higher tier
    
    for (let compResult of stats.armor) {
      let tiers = compResult.stats as number[]
      //tiers.forEach((e) => e = Math.floor(e / 10))
      for (let i = 0; i < tiers.length; i++) {
        tiers[i] = Math.floor((tiers[i] / 10))
      }
      console.log("DIM TIERS:", tiers)
      if (compResult.modCost < realModCost || !this.tiersMatch(tiers, actualTiers)) {
        // change to while
        if (this.containsLimitedArmor(compResult.items)) {
          let similar = stats.armor.filter((e) => e.modCost == compResult.modCost && this.tiersMatch(e.stats, tiers) && !this.containsLimitedArmor(e.items))
          if (similar.length == 0) {
            result.usesLimitedArmor = true;
          }
        }
      }
    }

    let seen = this.dimConfig.seenLoadouts.find((e) => e.id === result.id)
    if (seen != undefined) {
      let actualLoadout = this.loadoutWrap.find((e) => e.storedConfig.dimID === result.id);
      if (seen.lastUpdated != actualLoadout?.storedConfig.dimLastUpdated!) {
        console.log("DIM seen loadout date doesn't match")
        this.toggleSeenLoadout(loadout.dimID!)
      } else if (stats.lowestModCost >= seen.sawModCost && this.tiersMatch(stats.maxTiers, seen.sawTiers)) {
        result.seen = true;
      } else {
        console.log("Loadout changed after seen!")
        //this.toggleSeenLoadout(loadout.dimID!)
      }
    }

    return result;
  }

  containsLimitedArmor(items: any[]): boolean {
    let foundLimited = false;
    let index = 0

    while (index < items.length && !foundLimited) {
      if (this.custom.customItems.find((e) => e.name === items[index].name) != undefined) {
        foundLimited = true;
      }
      index++;
    }
    return foundLimited
  }

  tiersMatch(calcStats: number[], sawStats: number[]): boolean {
    for (let i = 0; i < calcStats.length; i++) {
      if (calcStats[i] != sawStats[i]) {
        return false;
      }
    }
    return true;
  }


  getDimItems(): StoredConfiguration[] {
    return this.storedConfigs.filter((v) => v.fromDIM == true)
  }

  getDimItemsDisabled(): StoredConfiguration[] {
    return this.storedConfigs.filter((v) => v.fromDIM == true && v.disabled == true)
  }

  getDimItemsEnabled(): loadoutWrapper[] {
    return this.loadoutWrap.filter((v) => v.storedConfig.fromDIM == true && v.storedConfig.disabled == false)
  }

  clearDIM() {
    this.storedConfigs.forEach(value => {
      if (value.fromDIM) {
        console.log("DELETE", value.name)
        this.config.deleteStoredConfiguration(value.name);
      }
    })
  }

  getTesting(): boolean {
    return this.dimAPI.isAuthenticated();
  }

  load(element: string, upgrade: boolean = false) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '300px',
      data: {description: "Do you want to load this preset?"} as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && upgrade) {
        let id = this.getDimItems().find((v) => v.name == element)?.dimID
        let improvedStats = this.loadoutWrap.find((v) => v.storedConfig.dimID == id)
        this.config.loadSavedConfiguration(element, true, improvedStats?.higherResult)
      } else if (result) {
        if (result) this.config.loadSavedConfiguration(element);
      }
    });
  }

  copySingleSettingToClipboard(element: any) {
    this.clipboard.copy(this.config.getStoredConfigurationBase64Compressed(element.name));
    this.openSnackBar('Copied the configuration to your clipboard. You can share it with your friends.')
  }

  // copyAllSettingsToClipboard() {
  //   this.clipboard.copy(this.config.getAllStoredConfigurationsBase64Compressed());
  //   this.openSnackBar('Exported all configurations to the clipboard. You can then save and share them.')
  // }

  openSnackBar(message: string) {
    this._snackBar.open(message,
      "", {
        duration: 2500,
        politeness: "polite"
      });
  }

  toggleSeenLoadout(loadoutID: string) {
    let actualLoadout = this.loadoutWrap.find((e) => e.storedConfig.dimID === loadoutID)

    if (this.dimConfig.seenLoadouts.find(e => e.id === loadoutID) != undefined) {
      this.dimConfig.seenLoadouts.splice(this.dimConfig.seenLoadouts.findIndex(e => e.id === loadoutID), 1)
      actualLoadout!.higherResult.seen = false
    } else {
      // let actualLoadout = this.storedConfigs.find((e) => e.dimID === loadoutID)
      // let higherLoadoutStat = this.improvedLoadouts.find((e) => e.id === loadoutID)
      let loadout: seenLoadout = {id: loadoutID, sawTiers: actualLoadout!.higherResult.maxTiers, sawModCost: actualLoadout!.higherResult.modCost, lastUpdated: actualLoadout?.storedConfig.dimLastUpdated!}
      actualLoadout!.higherResult.seen = true
      this.dimConfig.seenLoadouts.push(loadout)
    }
    this.saveDimConfig();
  }

  private ngUnsubscribe = new Subject();

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  saveDimConfig() {
    localStorage.setItem("dimConfig", JSON.stringify(this.dimConfig))
  }

  loadDimConfig(): dimConfiguration {
    let config = localStorage.getItem("dimConfig")
    if (config == null) {
      let config: dimConfiguration = {disabledLoadouts: [], seenLoadouts: []}
      return config;
    } else {
      return JSON.parse(config);
    }
  }
}
