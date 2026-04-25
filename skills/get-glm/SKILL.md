---
name: get-glm
description: 购买 GLM 订阅套餐。当用户需要购买智谱AI的GLM Coding订阅服务，或页面显示"暂时售罄"需要解除按钮禁用状态时触发此技能。支持 `at [time]` 参数进行定时购买，例如 `/get-glm at 10:00` 表示在10:00准时触发购买。
---

# GLM 订阅购买技能

帮助用户在智谱AI开放平台购买 GLM Coding 订阅套餐。

## 参数

- `at [time]`: 定时购买参数（可选）。当提供此参数时，假设按钮解禁已完成，在指定时间点触发购买按钮点击。
  - 格式: `HH:MM`（如 `10:00`）或 `HH:MM:SS`（如 `10:00:00`）
  - 默认值: `10:00:00`
  - 用途: 用于在补货时间点（如04月26日 10:00）准时抢购
  - 示例: `/get-glm at 10:00` 或 `/get-glm at 14:30:00`

## 依赖

此技能依赖 `chrome-devtools-mcp:chrome-devtools` 技能及其 MCP 工具。

## 工作流程

### 模式判断

根据是否有 `at` 参数，选择不同的工作流程：

1. **普通模式**（无 `at` 参数）：执行完整流程，包括解禁按钮
2. **定时模式**（有 `at` 参数）：在页面内注入 JavaScript 定时器，准时触发购买

---

## 普通模式工作流程

### 1. 检查并打开页面

先使用 `list_pages` 检查是否已有打开的目标页面：

```
mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages
```

检查返回的页面列表：
- **已存在包含 `open.bigmodel.cn/glm-coding` 的页面** → 使用 `select_page` 选择该页面
- **不存在** → 使用 `new_page` 打开新页面

### 2. 获取页面快照

```
mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_snapshot
```

分析快照内容，找到：
- "连续包季"订阅方式的区域
- Pro 套餐选项
- 购买订阅按钮及其状态

### 3. 选中 Pro 套餐

如果 Pro 套餐未被选中，使用 `click` 点击选中。

### 4. 解除购买按钮禁用状态并触发购买

页面使用 Vue 组件，禁用状态由组件内部的 `cardData.disabled` 控制。需要通过 Vue 组件修改状态并触发事件。

**完整解禁脚本：**

```javascript
() => {
  const app = document.querySelector('#app');
  const rootVue = app ? app.__vue__ : null;
  
  let result = { success: false, message: '', packageName: '' };
  
  if (rootVue) {
    const traverseComponents = (component, depth = 0) => {
      if (depth > 10) return;
      
      // 找到 PackageCard 组件
      if (component.$options && component.$options._componentTag === 'PackageCard') {
        const el = component.$el;
        const cardData = component.$props ? component.$props.cardData : null;
        const packageName = cardData ? cardData.productName : '';
        
        // 找到 Pro 套餐
        if (packageName === 'Pro') {
          // 修改 cardData 的禁用状态
          if (cardData) {
            cardData.disabled = false;
            cardData.soldOut = false;
            cardData.canPurchase = true;
          }
          
          // 触发点击事件
          component.$emit('clickBtn');
          
          // 调用 gotoPayFn 方法
          if (component.$options.methods && component.$options.methods.gotoPayFn) {
            component.$options.methods.gotoPayFn.call(component);
          }
          
          result = {
            success: true,
            message: '已触发购买流程',
            packageName: packageName,
            productId: cardData ? cardData.productId : null
          };
          return;
        }
      }
      
      if (component.$children) {
        for (const child of component.$children) {
          traverseComponents(child, depth + 1);
        }
      }
    };
    
    traverseComponents(rootVue);
  }
  
  return result;
}
```

调用：
```
mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script
function: <上述 JavaScript>
```

**执行结果：**
- 成功后，Pro 套餐按钮文字变为"特惠订阅"
- 弹出验证码弹窗，需要用户手动完成验证
- 验证码类型：图片点击式（如"请依次点击：崇 皑 变"）

### 5. 处理验证码

验证码弹窗出现后，用户需要：
- 根据提示点击图片中对应的文字位置
- 或等待技能后续版本支持自动验证码处理

---

## 定时模式工作流程（有 `at` 参数）

使用页面内 JavaScript `setTimeout` 实现精确定时，绕过 Claude 调度系统的延迟。

### 1. 检查并打开页面

同普通模式，确保页面已打开。

### 2. 解析目标时间

从参数获取目标时间字符串，默认为 `10:00:00`。

### 3. 注入页面内定时器脚本

**定时购买脚本（将目标时间硬编码到脚本中）：**

```javascript
() => {
  // 目标时间 - 根据用户参数修改此处
  const targetTimeStr = '10:00:00';  // 格式: HH:MM 或 HH:MM:SS
  
  const [hours, minutes, seconds = 0] = targetTimeStr.split(':').map(Number);
  
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, seconds, 0);
  
  // 如果目标时间已过，返回提示
  if (now >= target) {
    return {
      scheduled: false,
      message: `目标时间 ${targetTimeStr} 已过，当前时间 ${now.toLocaleTimeString()}`,
      currentTime: now.toLocaleTimeString(),
      targetTime: targetTimeStr
    };
  }
  
  const delayMs = target - now;
  
  console.log(`GLM购买定时器：将在 ${delayMs}ms 后（${target.toLocaleTimeString()}）触发购买`);
  
  // 清除已存在的定时器（如果有）
  if (window._glmPurchaseTimerId) {
    clearTimeout(window._glmPurchaseTimerId);
    console.log('GLM购买定时器：已清除之前的定时器');
  }
  
  // 设置定时器并存储ID
  window._glmPurchaseTimerId = setTimeout(() => {
    const app = document.querySelector('#app');
    const rootVue = app ? app.__vue__ : null;
    
    if (rootVue) {
      const traverse = (component, depth = 0) => {
        if (depth > 10) return;
        if (component.$options && component.$options._componentTag === 'PackageCard') {
          const cardData = component.$props ? component.$props.cardData : null;
          const packageName = cardData ? cardData.productName : '';
          if (packageName === 'Pro') {
            // 仅触发购买，不修改禁用状态（假设已解禁）
            component.$emit('clickBtn');
            if (component.$options.methods && component.$options.methods.gotoPayFn) {
              component.$options.methods.gotoPayFn.call(component);
            }
            console.log('GLM购买定时器：购买已触发！');
            // 触发后清除定时器ID
            window._glmPurchaseTimerId = null;
            return;
          }
        }
        if (component.$children) {
          for (const child of component.$children) {
            traverse(child, depth + 1);
          }
        }
      };
      traverse(rootVue);
    }
  }, delayMs);
  
  return {
    scheduled: true,
    message: `已设置定时器，将在 ${target.toLocaleTimeString()} 触发购买`,
    targetTime: target.toLocaleTimeString(),
    delayMs: delayMs,
    delaySeconds: Math.round(delayMs / 1000)
  };
}
```

调用方式：
```
mcp__plugin_chrome-devtools-mcp_chrome-devtools__evaluate_script
function: <上述 JavaScript（需修改 targetTimeStr 为用户指定的时间）>
```

**重要**：执行前需将脚本中的 `targetTimeStr` 值修改为用户指定的目标时间。

### 4. 返回结果告知用户

脚本返回结果包含：
- `scheduled`: 是否成功设置定时器
- `message`: 状态说明
- `delaySeconds`: 等待秒数
- 如果目标时间已过，返回提示信息

### 5. 处理验证码

定时器触发后，验证码弹窗会自动出现。用户需要手动完成验证码。

---

## 使用建议

1. **提前准备**：在目标时间前 1-2 分钟执行 `/get-glm at 10:00`，确保脚本注入完成
2. **保持页面打开**：定时器运行期间不要关闭或刷新页面
3. **验证码准备**：准备好手动点击验证码，抢购成功与否取决于验证码完成速度
