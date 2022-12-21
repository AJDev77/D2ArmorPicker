import {Injectable} from '@angular/core';
import {BuildConfiguration} from "../data/buildConfiguration";
import {BehaviorSubject, Observable} from "rxjs";
import {ModOrAbility} from "../data/enum/modOrAbility";
import * as lzutf8 from "lzutf8";
import {CompressionOptions, DecompressionOptions} from "lzutf8";
import {environment} from "../../environments/environment";
import {EnumDictionary} from "../data/types/EnumDictionary";
import {ArmorStat} from "../data/enum/armor-stat";
import {ArmorSlot} from "../data/enum/armor-slot";
import { dimHigherResult } from '../components/authenticated-v2/settings/load-dim-settings/load-and-save-settings.component';

export interface StoredConfiguration {
  version: string;
  name: string;
  configuration: BuildConfiguration;
  fromDIM: boolean
  dimID: string | undefined;
  dimLastUpdated: number | undefined;
  disabled: boolean;
}

const lzCompOptions = {
  outputEncoding: "Base64"
} as CompressionOptions

const lzDecompOptions = {
  inputEncoding: "Base64",
  outputEncoding: "String"
} as DecompressionOptions

@Injectable({
  providedIn: 'root'
})
export class ConfigurationService {

  private __configuration: BuildConfiguration;

  get readonlyConfigurationSnapshot() {
    return Object.assign(this.__configuration, {});
  }

  private _configuration: BehaviorSubject<BuildConfiguration>;
  public readonly configuration: Observable<BuildConfiguration>;

  private _storedConfigurations: BehaviorSubject<StoredConfiguration[]>;
  public readonly storedConfigurations: Observable<StoredConfiguration[]>;

  constructor() {
    this.__configuration = this.loadCurrentConfiguration();

    this._configuration = new BehaviorSubject(this.__configuration)
    this.configuration = this._configuration.asObservable();

    this._storedConfigurations = new BehaviorSubject(this.listSavedConfigurations())
    this.storedConfigurations = this._storedConfigurations.asObservable();
  }

  modifyConfiguration(cb: (configuration: BuildConfiguration) => void) {
    cb(this.__configuration);
    this.saveCurrentConfiguration(this.__configuration)
  }

  saveConfiguration(name: string, config: BuildConfiguration, fromDIM: boolean = false, dimID?: string,
     lastUpdated?: number, disabled: boolean = false) {
    let list = this.listSavedConfigurations();
    let c = this.listSavedConfigurations()
      .map((value, index): [StoredConfiguration, number] => [value, index])
      .filter(c => c[0].name == name)[0];
    if (!!c) {
      list.splice(c[1], 1)
    }
    list.push({
      configuration: config,
      name: name,
      version: environment.version,
      fromDIM: fromDIM,
      dimID: dimID,
      dimLastUpdated: lastUpdated,
      disabled: disabled
    });
    list = list.sort((a, b) => {
      if (a.dimLastUpdated != undefined && b.dimLastUpdated != undefined) {
        if (a.dimLastUpdated > b.dimLastUpdated) return -1;
        else if (a.dimLastUpdated < b.dimLastUpdated) return 1;
        return 0;
      } else {
          if (a.name < b.name) return -1;
          else if (a.name > b.name) return 1;
          return 0;
      }
    })

    const compressed = lzutf8.compress(JSON.stringify(list), lzCompOptions);
    localStorage.setItem("storedConfigurations", compressed)
    this._storedConfigurations.next(list);
  }

  doesDimConfigurationExist(name: string, id: string, lastUpdated?: number) {
    return this.listSavedConfigurations().filter(c => c.name == name && c.dimID == id && c.dimLastUpdated == lastUpdated).length > 0;
  }

  didDimNameChange(id: string, newName: string) {
    return this.listSavedConfigurations().filter(c => c.dimID == id && c.name != newName).length > 0;
  }

  doesSavedConfigurationExist(name: string) {
    return this.listSavedConfigurations().filter(c => c.name == name).length > 0;
  }

  listDimIDs(): string[] {
    let listIDs: string[] = [];
    let list = this.listSavedConfigurations().filter(c => c.fromDIM == true);
    list.forEach((v) => listIDs.push(v.dimID!))
    return listIDs;
  }

  loadSavedConfiguration(name: string, upgrade: boolean = false, improvedStats?: dimHigherResult): boolean {
    let c = this.listSavedConfigurations().filter(c => c.name == name)[0];
    if (!c) return false;
    if (upgrade) {
      for (let i = 0; i < improvedStats!.result.length; i++) {
        c.configuration.minimumStatTiers[i as ArmorStat].value += improvedStats!.result[i]
      }
    }
    this.saveCurrentConfiguration(c.configuration);
    return true;
  }

  checkAndFixOldSavedConfigurations(c: StoredConfiguration) {
    c.configuration = Object.assign(BuildConfiguration.buildEmptyConfiguration(), c.configuration);
    if (c.configuration.hasOwnProperty("minimumStatTier")) {
      let tiers = (c.configuration as any).minimumStatTier as EnumDictionary<ArmorStat, number>;
      c.configuration.minimumStatTiers[ArmorStat.Mobility].value = tiers[ArmorStat.Mobility];
      c.configuration.minimumStatTiers[ArmorStat.Resilience].value = tiers[ArmorStat.Resilience];
      c.configuration.minimumStatTiers[ArmorStat.Recovery].value = tiers[ArmorStat.Recovery];
      c.configuration.minimumStatTiers[ArmorStat.Discipline].value = tiers[ArmorStat.Discipline];
      c.configuration.minimumStatTiers[ArmorStat.Intellect].value = tiers[ArmorStat.Intellect];
      c.configuration.minimumStatTiers[ArmorStat.Strength].value = tiers[ArmorStat.Strength];
      delete (c.configuration as any).minimumStatTier;
    }

    if (c.configuration.hasOwnProperty("fixedArmorAffinities")) {
      const affinities = (c.configuration as any).fixedArmorAffinities as any;
      for (let key in affinities) {
        let n = (Number.parseInt(key) + 1) as ArmorSlot
        c.configuration.armorAffinities[n].value = affinities[key];
      }
      // It was a default setting back then, so we enforce it when we import old settings.
      c.configuration.ignoreArmorAffinitiesOnNonMasterworkedItems = true;
      delete (c.configuration as any).fixedArmorAffinities;
    }

    if (c.configuration.hasOwnProperty("selectedExoticHash")) {
      c.configuration.selectedExotics = [(c.configuration as any).selectedExoticHash]
      delete (c.configuration as any).selectedExoticHash;
    }
    if (c.configuration.hasOwnProperty("maximumStatMods")) {
      let maxMods = (c.configuration as any).maximumStatMods as number;
      for (let n = maxMods; n < 5; n++)
        c.configuration.maximumModSlots[1 + n as ArmorSlot].value = 0;
      delete (c.configuration as any).maximumStatMods;
    }

    // Always reset limitParsedResults on reload
    c.configuration.limitParsedResults = true;
  }

  listSavedConfigurations(): StoredConfiguration[] {
    let item;
    try {
      item = localStorage.getItem("storedConfigurations") || "[]";
      if (item.substr(0, 1) != "[")
        item = lzutf8.decompress(item, lzDecompOptions);
    } catch (e) {
      item = []
    }

    let result = (JSON.parse(item) || []) as StoredConfiguration[]
    result = result.sort((a, b) => {
      if (a.dimLastUpdated != undefined && b.dimLastUpdated != undefined) {
        if (a.dimLastUpdated > b.dimLastUpdated) return -1;
        else if (a.dimLastUpdated < b.dimLastUpdated) return 1;
        return 0;
      } else {
          if (a.name < b.name) return -1;
          else if (a.name > b.name) return 1;
          return 0;
      }
    })
    result.forEach(c => this.checkAndFixOldSavedConfigurations(c))
    return result;
  }

  deleteStoredConfiguration(name: string) {
    let list = this.listSavedConfigurations();
    let c = this.listSavedConfigurations()
      .map((value, index): [StoredConfiguration, number] => [value, index])
      .filter(c => c[0].name == name)[0];
    if (!!c) {
      list.splice(c[1], 1)
    }
    localStorage.setItem("storedConfigurations", lzutf8.compress(JSON.stringify(list), lzCompOptions))
    this._storedConfigurations.next(list);
  }

  deleteDimConfigurationByID(id: string) {
    let list = this.listSavedConfigurations();
    let c = this.listSavedConfigurations()
      .map((value, index): [StoredConfiguration, number] => [value, index])
      .filter(c => c[0].dimID == id)[0];
    if (!!c) {
      list.splice(c[1], 1)
    }
    localStorage.setItem("storedConfigurations", lzutf8.compress(JSON.stringify(list), lzCompOptions))
    this._storedConfigurations.next(list);
  }

  saveCurrentConfigurationToName(name: string) {
    this.saveConfiguration(name, this.__configuration);
  }

  saveCurrentConfiguration(configuration: BuildConfiguration) {
    console.debug("write configuration", configuration)
    // deep copy it
    this.__configuration = Object.assign(BuildConfiguration.buildEmptyConfiguration(), configuration);
    this.__configuration.enabledMods = ([] as ModOrAbility[]).concat(this.__configuration.enabledMods);
    this.__configuration.minimumStatTiers = Object.assign({}, this.__configuration.minimumStatTiers)

    const compressed = lzutf8.compress(JSON.stringify(this.__configuration), lzCompOptions)
    localStorage.setItem("currentConfig", compressed);
    this._configuration.next(Object.assign({}, this.__configuration));
  }

  loadCurrentConfiguration() {
    let config;
    try {
      config = localStorage.getItem("currentConfig") || "{}";
      if (config.substr(0, 1) != "{")
        config = lzutf8.decompress(config, lzDecompOptions);
    } catch (e) {
      config = {}
    }

    var dummy: StoredConfiguration = {name: "dummy", version: "1", configuration: JSON.parse(config),
          fromDIM: false, dimID: undefined, dimLastUpdated: undefined, disabled: false}
    this.checkAndFixOldSavedConfigurations(dummy);
    return dummy.configuration;
  }

  getCurrentConfigBase64Compressed(): string {
    let config = localStorage.getItem("currentConfig") || "{}";
    if (config.substr(0, 1) == "{")
      config = lzutf8.compress(config, {outputEncoding: "Base64"});
    return config;
  }

  getAllStoredConfigurationsBase64Compressed(): string {
    let item = localStorage.getItem("storedConfigurations") || "[]";
    if (item.substr(0, 1) == "[")
      item = lzutf8.compress(item, {outputEncoding: "Base64"});
    return item;
  }

  getStoredConfigurationBase64Compressed(name: string): string {
    let c = this.listSavedConfigurations().filter(c => c.name == name)[0];
    if (!c) return "";
    return lzutf8.compress(JSON.stringify(c), {outputEncoding: "Base64"});
  }

  resetCurrentConfiguration() {
    this.saveCurrentConfiguration(BuildConfiguration.buildEmptyConfiguration())
  }
}
