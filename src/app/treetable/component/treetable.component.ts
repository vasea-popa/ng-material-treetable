import {Component, OnInit, Input, Output, ElementRef, OnChanges, SimpleChanges} from '@angular/core';
import {Node, TreeTableNode, Options, SearchableNode, TreeTableCustomHeader, TreeTableAction, EmittedActionTree} from '../models';
import { TreeService } from '../services/tree/tree.service';
import { ValidatorService } from '../services/validator/validator.service';
import { ConverterService } from '../services/converter/converter.service';
import { defaultOptions } from '../default.options';
import { flatMap, defaults } from 'lodash-es';
import { Subject } from 'rxjs';
import {MatTableDataSource} from '@angular/material/table';

@Component({
  selector: 'ng-treetable, treetable', // 'ng-treetable' is currently being deprecated
  templateUrl: './treetable.component.html',
  styleUrls: ['./treetable.component.scss']
})
export class TreetableComponent<T> implements OnInit, OnChanges {
  get treeTable(): TreeTableNode<T>[] {
    return this._treeTable;
  }
  @Input() tree: Node<T> | Node<T>[];
  @Input() customHeader: TreeTableCustomHeader[];
  @Input() actions: TreeTableAction[];
  @Input() options: Options<T> = {};
  @Output() nodeClicked: Subject<TreeTableNode<T>> = new Subject();
  @Output() actionClicked: Subject<EmittedActionTree<T>> = new Subject();
  @Output() treeLabelClicked: Subject<TreeTableNode<T>> = new Subject();
  private searchableTree: SearchableNode<T>[];
  private _treeTable: TreeTableNode<T>[];
  displayedColumns: TreeTableCustomHeader[];
  extendedDisplayedColumns: string[];
  dataSource: MatTableDataSource<TreeTableNode<T>>;
  expandedNodes: Set<string> = new Set();

  constructor(
    private treeService: TreeService,
    private validatorService: ValidatorService,
    private converterService: ConverterService,
    elem: ElementRef
  ) {
    const tagName = elem.nativeElement.tagName.toLowerCase();
    if (tagName === 'ng-treetable') {
      console.warn(`DEPRECATION WARNING: \n The 'ng-treetable' selector is being deprecated. Please use the new 'treetable' selector`);
    }
  }

  ngOnInit() {
    this.tree = Array.isArray(this.tree) ? this.tree : [this.tree];
    this.options = this.parseOptions(defaultOptions);
    const customOrderValidator = this.validatorService.validateCustomOrder(this.tree[0], this.options.customColumnOrder);
    if (this.options.customColumnOrder && !customOrderValidator.valid) {
      throw new Error(`
        Properties ${customOrderValidator.xor.map(x => `'${x}'`).join(', ')} incorrect or missing in customColumnOrder`
      );
    }
    const toCustomHeader = (columns: string[]): TreeTableCustomHeader[] => {
      return columns.map(val => {
        return {label: val.toString(), keyValue: val.toString()};
      });
    };
    this.displayedColumns = this.customHeader
      ? this.customHeader
      : this.options.customColumnOrder
      ? toCustomHeader(this.options.customColumnOrder)
      : toCustomHeader(this.extractNodeProps(this.tree[0]));
    const plainColumns = this.displayedColumns.map(col => col.keyValue);
    this.extendedDisplayedColumns = this.actions ? [...plainColumns, 'actions'] : plainColumns;
    this.createDataSource(this.tree);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.tree && changes.tree.currentValue && !changes.tree.firstChange) {
      this.createDataSource(changes.tree.currentValue);
    }
  }

  createDataSource(tree: Node<T>[]) {
    this.searchableTree = tree.map(t => this.converterService.toSearchableTree(t));
    const treeTableTree = this.searchableTree.map(st =>
      this.converterService.toTreeTableTree(st, this.options.defaultExpanded, this.expandedNodes));
    this._treeTable = flatMap(treeTableTree, this.treeService.flatten);
    this.showExpandedChildren();
    this.dataSource = this.generateDataSource();
  }

  extractNodeProps(tree: Node<T> & { value: { [k: string]: any } }): string[] {
    return Object.keys(tree.value).filter(x => typeof tree.value[x] !== 'object');
  }

  generateDataSource(): MatTableDataSource<TreeTableNode<T>> {
    return new MatTableDataSource(this._treeTable.filter(x => x.isVisible));
  }

  formatIndentation(node: TreeTableNode<T>, step: number = 5): string {
    return '&nbsp;'.repeat(node.depth * step);
  }

	formatElevation(): string {
		return `mat-elevation-z${this.options.elevation}`;
	}

	checkVisibilityForAction(action: TreeTableAction, node: TreeTableNode<T>): boolean {
    return action.actionName in node.value && (node.value as any)[action.actionName];
  }

  onNodeClick(clickedNode: TreeTableNode<T>): void {
    if (!clickedNode.isExpanded) {
      this.expandedNodes.add(clickedNode.id);
    } else {
      this.expandedNodes.delete(clickedNode.id);
    }
    clickedNode.isExpanded = !clickedNode.isExpanded;
    this.showExpandedChildren();
    this.dataSource = this.generateDataSource();
    this.nodeClicked.next(clickedNode);
  }

  // Overrides default options with those specified by the user
  parseOptions(defaultOpts: Options<T>): Options<T> {
    return defaults(this.options, defaultOpts);
  }

  onActionClicked(action: EmittedActionTree<T>) {
    this.actionClicked.next(action);
  }

  onTreeLabelClick(clickedNode: TreeTableNode<T>) {
    this.treeLabelClicked.next(clickedNode);
  }

  private showExpandedChildren() {
    this._treeTable.forEach(el => {
      el.isVisible = this.searchableTree.every(st => {
        return this.treeService.searchById(st, el.id).
        fold([], n => n.pathToRoot)
          .every(p => this._treeTable.find(x => x.id === p.id).isExpanded);
      });
    });
  }

}
