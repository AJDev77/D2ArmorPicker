import {Component, OnDestroy, OnInit} from '@angular/core';
import {ConfigurationService, StoredConfiguration} from "../../../../services/configuration.service";
import {UntypedFormBuilder, UntypedFormGroup} from "@angular/forms";
import {MatDialog} from "@angular/material/dialog";
import {ConfirmDialogComponent, ConfirmDialogData} from "../../components/confirm-dialog/confirm-dialog.component";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Subject} from "rxjs";
import {Clipboard} from "@angular/cdk/clipboard";
import {StatusProviderService} from "../../../../services/status-provider.service";
import { DimApiService } from 'src/app/services/dim-api.service';
import { ArmorStat } from 'src/app/data/enum/armor-stat';

export interface dimHigherResult {
  id: string,
  result: number[],
  higher: boolean
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
  improvedLoadouts: dimHigherResult[] = [];
  displayedColumns = ["name", "class", "mobility", "resilience", "recovery", "discipline", "intellect", "strength", "improve", "delete"];

  settingsNameForm: UntypedFormGroup;
  importTextForm: UntypedFormGroup;

  testing: boolean = false;


  constructor(public config: ConfigurationService, private formBuilder: UntypedFormBuilder,
              public dialog: MatDialog, private _snackBar: MatSnackBar, private clipboard: Clipboard,
              private dimAPI: DimApiService, public status: StatusProviderService) {
    this.settingsNameForm = this.formBuilder.group({name: [null,]});
    this.importTextForm = this.formBuilder.group({content: [null,]});
  }

  ngOnInit(): void {
    this.config.storedConfigurations
      .subscribe(d => this.storedConfigs = d);
      this.dimAPI.getDimLoadouts();

}

  getDimStatus(): boolean {
    return this.checkingStats || this.dimAPI.updating;
  }

  isDimConnected(): boolean {
    return this.dimAPI.isAuthenticated()
  }

  async updateDim() {
    this.improvedLoadouts = []
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

  canLoadoutImprove(loadoutID: string): boolean {
    if (this.improvedLoadouts.find(function (element) {
      return element.id === loadoutID && element.higher == true;
    }) !== undefined) {
      return true;
    }
    return false;
  }

  hasLoadoutBeenChecked(loadoutID: string): boolean {
    if (this.improvedLoadouts.find(function (element) {
      return element.id === loadoutID;
    }) !== undefined) {
      return true;
    }
    return false;
  }

  howCanLoadoutImprove(loadoutID: string): string {
    let stats = ["Mobility", "Resilience", "Recovery", "Discipline", "Intellect", "Strength"];
    let element = this.improvedLoadouts.find(function (element) {
      return element.id === loadoutID})!
    let result: string = ""
    for (let i = 0; i < element.result.length; i++) {
      if (element.result[i] !== undefined) {
        if (i != 0) {
          result = result + " ";
        }
        result = result + stats[i] + ": +" + element.result[i]
        if (i != element.result.length - 1) {
          result = result + ","
        }
      }
    }
    return result;
  }

  async checkArmorImprovement(loadoutID: string) {
    this.checkingLoadout = loadoutID
    let existing = this.improvedLoadouts.findIndex((v) => v.id == loadoutID);
    if (existing != -1) {
      this.improvedLoadouts.splice(existing, 1);
    }
    let loadout = this.getDimItems().find((v) => v.dimID == loadoutID)
    await this.dimAPI.checkLoadoutStats(1, loadout!.configuration).then((v) => {
      //console.log("PROMISED RESULT: ", v)
      let higherResult = this.checkIfHigher(loadout!, v);
      //if (higherResult.higher) {
      this.improvedLoadouts.push(higherResult);
      //}
      //num++;
      console.log("TESTING", loadout!.name, " is ", higherResult);
    })
    this.checkingLoadout = ""
  }

  async checkAllArmorImprovement() {
    this.checkingStats = true;
    this.improvedLoadouts = [];
    let loadouts = this.getDimItemsEnabled();
    let num = 0;
    //document.getElementById("progress")!.hidden = false;
     for (let loadout of loadouts) {
        this.progressText = "Progress: " + num +"/" + loadouts.length
      //console.log("TESTING: ", loadout)
        await this.checkArmorImprovement(loadout.dimID!)
        num++;
     }
     this.progressText = "Unavailable"
     this.checkingStats = false;

     //document.getElementById("progress")!.hidden = true;
  }

  // async testSeeArmorResults() {
  //   this.improvedLoadouts = [];
  //   let loadouts = this.getDimItemsEnabled();
  //   let num = 0;
  //   document.getElementById("progress")!.hidden = false;
  //    for (let loadout of loadouts) {
  //       document.getElementById("progress")!.textContent = "Progress: " + num +"/" + loadouts.length
  //     //console.log("TESTING: ", loadout)
  //     await this.dimAPI.checkLoadoutStats(1, loadout.configuration).then((v) => {
  //       //console.log("PROMISED RESULT: ", v)
  //       let higherResult = this.checkIfHigher(loadout, v);
  //       //if (higherResult.higher) {
  //       this.improvedLoadouts.push(higherResult);
  //       //}
  //       num++;
  //       console.log("TESTING", loadout.name, " is ", higherResult);
  //     })
  //    }
  //    document.getElementById("progress")!.hidden = true;
  // }

  checkIfHigher(loadout: StoredConfiguration, stats: number[]): dimHigherResult {
    let result: dimHigherResult = {higher: false, id: loadout.dimID!, result: []}

    for (let i = 0; i < stats.length; i++) {
      if (stats[i] > loadout.configuration.minimumStatTiers[i as ArmorStat].value) {
        result.higher = true;
        result.result[i] = stats[i] - loadout.configuration.minimumStatTiers[i as ArmorStat].value
      }
    }

    // while (i < 6 && !higher) {
    //   if (stats[i] > loadout.configuration.minimumStatTiers[i as ArmorStat].value) {
    //       higher = true;
    //   }
    //   i++;
    // }
    return result;
  }


  getDimItems(): StoredConfiguration[] {
    return this.storedConfigs.filter((v) => v.fromDIM == true)
  }

  getDimItemsDisabled(): StoredConfiguration[] {
    return this.storedConfigs.filter((v) => v.fromDIM == true && v.disabled == true)
  }

  getDimItemsEnabled(): StoredConfiguration[] {
    return this.storedConfigs.filter((v) => v.fromDIM == true && v.disabled == false)
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
        let improvedStats = this.improvedLoadouts.find((v) => v.id == id)
        this.config.loadSavedConfiguration(element, true, improvedStats)
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

  private ngUnsubscribe = new Subject();

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
