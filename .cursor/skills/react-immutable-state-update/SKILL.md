---
name: react-immutable-state-update
description: Use when React setState 后部分 UI 已更新（如列表/格子出现新内容）但另一块依赖同一 state 的 UI 不更新（如计数、摘要），或用户说“点了有反应但数字/统计没变”。指导用不可变更新替代“先改当前 state 再 return”的写法，避免共享引用导致 React 不触发重渲染。
---

# React 状态不可变更新（避免部分 UI 不刷新）

## 何时调用本 Skill

- 调用 `setState(prev => next)` 后，**部分 UI 已更新**（例如列表里新项出现、格子上新元素出现），但**另一块依赖同一 state 的 UI 不更新**（例如“已放 x/10”、计数、摘要）。
- 或：事件处理里先改了 state 上的对象/数组（如 `prev.cells[i].place(...)`、`prev.pools[key]--`），再 `return { ...prev, someNewArray }`，期望整页一起更新，但某些组件不刷新。
- 用户描述类似：“点了之后格子上有了，但右上角数字没变”“只有 batch 模式会更新计数”等。

## 根因简述

- `next = { ...prev, x: newX }` 只新建了顶层对象和 `x`，**没新建** `prev` 里其它引用（如 `prev.cells`、`prev.pools`）。
- 若在 `next`（或共享了引用的对象）上调用会**原地修改**的函数（如 `applyPlace(next, ...)` 里 `cell.place(...)`、`state.pools[...]--`），改的是和 `prev` **同一批引用**，等于**直接改了当前 React state**。
- 因此：视觉上“新数据”已经出现（因为 state 被就地改了），但 `setState` 返回的 `next` 和 `prev` 在引用上几乎相同，React 可能不触发或不可靠地触发依赖该 state 的重新渲染，导致“计数/摘要”等不更新。

## 正确做法：完全不可变更新

1. **不要**在 `prev` 或与 `prev` 共享引用的对象上做会改变其内部状态的调用（如 `.place()`、`.splice()`、`obj[key]--`）。
2. **校验**：用只读的校验函数（如 `validatePlace(prev, ...)`）决定是否允许本次更新，不通过则 `return prev`。
3. **克隆要改的那一块**：例如用 `Cell.fromJSON(cell.toJSON(), gridConfig)` 克隆受影响的 cell，在**克隆**上执行 `place`/`remove`。
4. **用 map 构造新引用**：用 `prev.cells.map(...)`、`prev.pools.map(...)` 等构造新的 `newCells`、`newPools`，只替换被改的那一项为克隆/新值。
5. **返回全新 state**：`return { ...prev, cells: newCells, pools: newPools, placementHistory: newHistory, turnPlacedCount: newHistory.length }`，确保所有被逻辑“修改”过的分支都是**新对象/新数组**。

## 之前易踩的“无效修复”

- 只把“单次更新”从 `setState` 换成 `updateState`，或只改 `placementHistory` 的赋值方式：若仍调用会 **mutate** `state.cells` / `state.pools` 的函数，问题依旧。
- 用 `flushSync` 或额外 `setPlaceCountTick` 强制重渲染：若 **state 引用树没变**，重渲染读到的仍是旧数据。
- 在子组件里改用 `state.xxx?.length` 或加 `key`：若 **state 本身没被正确更新**，读到的还是旧值，无效。

## 通俗记法

- **不要直接改“当前这份 state”里的对象/数组**；要改就**复制那一块**，在复制品上改，再把“新的一份”通过 setState 交给 React。
- 只复制“会变的那一小块”（例如一格 cell、一行 cells、一个数组多一条记录），不是整棵 state 树深拷贝；在常规 UI 操作频率下开销通常可接受。

## 一句话

**只要有任何逻辑会“就地修改”当前 state 或其子引用，就改为：校验用只读、修改只发生在克隆/新对象上，再返回一个在“被改分支”上全是新引用的新 state。**
