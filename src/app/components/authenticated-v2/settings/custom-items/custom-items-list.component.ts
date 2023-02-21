import {Component, OnDestroy, OnInit} from '@angular/core';
import {ConfigurationService} from "../../../../services/configuration.service";
import {IInventoryArmor} from "../../../../data/types/IInventoryArmor";
import {Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";
import { CharacterClass } from 'src/app/data/enum/character-Class';
import { CustomItemService } from 'src/app/services/custom-item.service';

@Component({
  selector: 'app-custom-items-list',
  templateUrl: './custom-items-list.component.html',
  styleUrls: ['./custom-items-list.component.scss']
})

export class CustomItemsListComponent implements OnInit, OnDestroy {

  //disabledItems: IInventoryArmor [] = [];
  currentClass: CharacterClass | null = null;
  

  constructor(private config: ConfigurationService, private customItems: CustomItemService) {
    //console.log("Vendors: new instance of custom items")
  }

  removeItem(instanceId: string) {
    // this.config.modifyConfiguration(cb => {
    //   cb.customItems.splice(cb.customItems.indexOf(instanceId), 1)
    // })
  }

  generateTooltip(armor: IInventoryArmor) {
    return armor.name +
      "\nMobility: " + (armor.mobility + (armor.masterworked ? 2 : 0)) +
      "\nResilience: " + (armor.resilience + (armor.masterworked ? 2 : 0)) +
      "\nRecovery: " + (armor.recovery + (armor.masterworked ? 2 : 0)) +
      "\nDiscipline: " + (armor.discipline + (armor.masterworked ? 2 : 0)) +
      "\nIntellect: " + (armor.intellect + (armor.masterworked ? 2 : 0)) +
      "\nStrength: " + (armor.strength + (armor.masterworked ? 2 : 0))
  }

  ngOnInit(): void {
    // when vendor not available, refreshes every config change
    this.config.configuration
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(async c => {
        if (c.characterClass != this.currentClass || this.customItems.customItems.length == 0) {
          this.currentClass = c.characterClass;
          await this.refreshVendorArmor();
        }
      })

    // this.inventory.manifest
    //   .pipe(
    //     debounceTime(10),
    //     takeUntil(this.ngUnsubscribe)
    //   )
    //   .subscribe(async () => {
    //     await this.updateExoticsForClass();
    //   })
    //this.refreshVendorArmor();
  }

  async refreshVendorArmor() {
    await this.customItems.refreshXurArmor();
  }

  getCustomItems(): IInventoryArmor [] {
    return this.customItems.customItems;
  }


  private ngUnsubscribe = new Subject();

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
