# Kinko 增强功能实施计划

## 1. 目标
根据用户反馈，对 Kinko 企业管理系统进行四项关键功能增强：
1.  **单价精度提升**：单价需支持小数点后 4 位。
2.  **客户自定义分组**：允许用户对客户进行自定义分组，方便查找。
3.  **对账与付款管理**：
    *   增加客户付款记录登记功能。
    *   支持多种支付方式：对公（现金、承兑）、对私（支付宝、微信、卡号）。
    *   支持录入客户原始欠款金额。
4.  **智能单价引用**：创建新送货单时，自动引用该客户上次购买该产品的单价。

## 2. 详细实施步骤

### 2.1 数据库变更 (Database Schema Updates)
*   **修改现有实体 (Entities)**
    *   `Product` (产品表): 将 `price` (单价), `cost` (成本) 字段精度从 `decimal(10,2)` 修改为 `decimal(12,4)`。
    *   `DeliveryOrderItem` (送货单明细表): 将 `price` 字段精度修改为 `decimal(12,4)`。
    *   `InventoryRecord` (库存记录表): 将涉及金额的字段精度修改为 `decimal(12,4)`。
    *   `Customer` (客户表):
        *   新增 `group` (分组) 字段，类型为 `varchar`，允许为空。
        *   新增 `initialArrears` (期初欠款) 字段，类型为 `decimal(12,2)`，默认 0。
*   **创建新实体**
    *   `PaymentRecord` (付款记录表):
        *   `id`: 主键
        *   `customerId`: 外键关联 `Customer`
        *   `amount`: 金额 `decimal(12,2)`
        *   `paymentDate`: 付款日期 `Date`
        *   `method`: 支付方式 (枚举/字符串: 'Public_Cash', 'Public_Acceptance', 'Private_Alipay', 'Private_Wechat', 'Private_Card')
        *   `remarks`: 备注
        *   `createdAt`, `updatedAt`

### 2.2 后端逻辑开发 (Backend Logic)
*   **单价精度适配**:
    *   更新 `ProductController`, `DeliveryController`, `InventoryController` 中涉及金额计算的逻辑，确保支持 4 位小数。
*   **客户分组与期初欠款**:
    *   更新 `CustomerController` 的 CRUD 接口，支持 `group` 和 `initialArrears` 字段的读写。
    *   实现客户分组的筛选/查询接口。
*   **付款记录管理**:
    *   创建 `PaymentRecordController`。
    *   实现 `create`, `list` (按客户/时间范围筛选), `delete` 接口。
    *   更新对账逻辑：计算客户余额时，需包含 `initialArrears` + `DeliveryOrder Total` - `PaymentRecord Total`。
*   **智能单价引用**:
    *   在 `DeliveryController` 或 `ProductController` 中新增接口 `/api/delivery/last-price`。
    *   逻辑：接收 `customerId` 和 `productId`，查询 `DeliveryOrderItem` 表，按 `createdAt` 倒序查找最近的一条记录并返回其 `price`。如果无记录，返回产品基础单价。

### 2.3 前端界面开发 (Frontend UI)
*   **全局精度调整**:
    *   修改所有涉及单价的 `InputNumber` 组件，`precision` 设为 4，`step` 设为 0.0001。
    *   修改表格显示，金额格式化函数需支持 4 位小数显示。
*   **客户管理优化**:
    *   客户编辑/创建弹窗：增加“客户分组”输入框（支持输入新分组或选择已有分组，使用 `AutoComplete` 组件）。
    *   客户编辑/创建弹窗：增加“期初欠款”输入框。
    *   客户列表页：增加“分组”筛选器。
*   **对账管理升级**:
    *   新增“付款记录” Tab 或 独立页面。
    *   实现“登记付款”功能：
        *   选择客户
        *   输入金额
        *   选择支付方式（下拉菜单：对公-现金, 对公-承兑, 对私-支付宝, 对私-微信, 对私-卡号）
        *   选择日期
        *   备注
    *   对账单展示优化：
        *   显示期初欠款。
        *   显示累计送货金额。
        *   显示累计已付金额。
        *   显示当前结余。
*   **送货单开单优化**:
    *   在选择产品时，监听 `product` 和 `customer` 的变化。
    *   当两者都选定后，触发 API 请求获取“上次单价”。
    *   自动填充“单价”输入框，并允许用户手动修改。

## 3. 验证计划
1.  **精度测试**: 输入 0.1234 的单价，保存后刷新，确认显示为 0.1234 且计算总价正确。
2.  **分组测试**: 创建不同分组的客户，验证筛选功能。
3.  **对账测试**:
    *   设置客户期初欠款 1000。
    *   开送货单 500。
    *   登记付款 800 (微信)。
    *   验证余额应为 1000 + 500 - 800 = 700。
4.  **单价引用测试**:
    *   客户 A 购买产品 P，单价修改为 5.5555。
    *   再次为客户 A 创建产品 P 的送货单，确认默认单价自动变为 5.5555。
    *   为客户 B 创建产品 P 的送货单，确认单价为产品基础单价（或客户 B 的上次单价）。
