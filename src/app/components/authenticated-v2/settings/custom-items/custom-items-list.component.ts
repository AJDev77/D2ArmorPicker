import {Component, OnDestroy, OnInit} from '@angular/core';
import {ConfigurationService} from "../../../../services/configuration.service";
import {DatabaseService} from "../../../../services/database.service";
import {IInventoryArmor} from "../../../../data/types/IInventoryArmor";
import {Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";

@Component({
  selector: 'app-custom-items-list',
  templateUrl: './custom-items-list.component.html',
  styleUrls: ['./custom-items-list.component.scss']
})
export class CustomItemsListComponent implements OnInit, OnDestroy {

  disabledItems: IInventoryArmor [] = [];

  constructor(private config: ConfigurationService, private db: DatabaseService) {
  }

  enableItem(instanceId: string) {
    this.config.modifyConfiguration(cb => {
      cb.disabledItems.splice(cb.disabledItems.indexOf(instanceId), 1)
    })
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
    this.config.configuration
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(async cb => {
        let items = [];
        var storedNames = JSON.parse(localStorage.getItem("xur")!) as IInventoryArmor[];
        // for (let hash of storedNames) {
        //   let itemInstance = await this.db.inventoryArmor.where("itemInstanceId").equals(hash).first();
        //   if (itemInstance)
        //     items.push(itemInstance)
        // }
        this.disabledItems = storedNames;
      })
  }


  private ngUnsubscribe = new Subject();

  ngOnDestroy() {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }
}
