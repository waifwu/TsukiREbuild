// words.js - the port's own words in the language in use, where that language has them. So far: the config's Controls page in Chinese (keys.js ACTIONS,
// MENU_KEYS, MOUSE; touch.js TOUCH_CONTROLS; ui.js buildControlsPage), at the user's word (2026-11-14: "translate the eng parts in config menu the
// controls section"). Every other language, and every other page, keeps the English. The terms are the Chinese patch's own where it has one (its system
// messages: 快进, 自动模式, 快速保存, 快速加载, 回到前面的场景, 跳到下一个场景, 日志, 倒带; its help bar: 确定, 返回, 移动, 页面变更, 滚动; its
// gallery: 图像的切换, 扩大・缩小). The Chinese faces keep only the letters Chinese uses, and this file is read for them (build_zh.py used_letters).
import { RU, ZH } from "./lang.js";
import { tr } from "./sitewords.js";

export const CONTROLS_ZH = {
  // the page's headings and notes
  "Keyboard": "键盘",
  "Click a key to change it.  Esc cancels, Backspace clears.": "点击按键即可更改。Esc 取消，Backspace 清除。",
  "Menus": "菜单",
  "Mouse": "鼠标",
  "Touch": "触屏",
  "Press a key": "请按下按键",
  "key": "按键",
  // the story's actions (keys.js ACTIONS)
  "Advance text": "推进文本",
  "Fast forward (while held)": "按住、快进",
  "Skip read text: on / off": "跳过已读句子 ON / OFF",
  "Auto mode: on / off": "自动模式 ON / OFF",
  "Log": "日志",
  "Previous message": "倒带（上一句）",
  "Hide text": "隐藏文本",
  "Replay voice": "播放最后的语音",
  "Quick save": "快速保存",
  "Quick load": "快速加载",
  "Return to previous scene": "回到前面的场景",
  "Jump to next scene": "跳到下一个场景",
  "Quick bar": "快捷栏",
  "Save": "保存",
  "Load": "加载",
  "Config": "设置",
  "System menu": "系统菜单",
  "Full screen": "全屏",
  // the menus' keys (keys.js MENU_KEYS)
  "Move": "移动",
  "Choose": "确定",
  "Back": "返回",
  "Change page": "页面变更",
  "Scroll": "滚动",
  "First / last": "首项 / 末项",
  // the mouse (keys.js MOUSE)
  "Advance text, choose": "推进文本、确定",
  "System menu, back": "系统菜单、返回",
  "Advance text, scroll": "推进文本、滚动",
  "Left click": "左键单击",
  "Right click": "右键单击",
  "Wheel up": "滚轮向上",
  "Wheel down": "滚轮向下",
  "Middle click": "中键单击",
  "Top edge": "屏幕顶端",
  // a key's name that is a word, not what is printed on the key
  "Space": "空格",
  // by touch (touch.js TOUCH_CONTROLS)
  "Tap": "轻触",
  "Control panel": "控制面板",
  "Swipe down, or tap the top edge": "向下滑动，或轻触屏幕顶端",
  "Swipe up": "向上滑动",
  "Fast forward": "快进",
  "Touch and hold": "长按",
  "Tap with two fingers": "双指轻触",
  "The Back button": "返回按钮",
  "Scroll a list": "滚动列表",
  "Drag": "拖动",
  "A choice": "选项",
  "Tap it to light it, tap again to take it": "轻触点亮，再次轻触选择",
  "CG viewer": "CG 鉴赏",
  "Tap or swipe: picture, pinch: zoom, drag: move": "轻触或滑动：图像的切换，双指：扩大・缩小，拖动：移动",
  "Flowchart": "流程图",
  "Tap a scene to see it, tap again to open it, pinch: zoom": "轻触场景查看，再次轻触打开，双指：扩大・缩小",
  // controller (gamepad.js / ui.js buildControlsPage)
  "Controller": "手柄",
  "Confirm / Cancel": "确定 / 返回",
  "Button prompts": "按键提示",
  "Auto": "自动",
  "South (A / \u2715)": "下键（A / \u2715）",
  "East (A / \u25cb)": "右键（A / \u25cb）",
  // the desktop app's section
  "Desktop": "桌面",
  "Discord Rich Presence": "Discord 动态",
  "On": "开",
  "Off": "关",
};

// The Controls page's words in the language in use: Chinese where the table has them, else the English as it is.
// Russian's are among its page words (sitewords-ru.js), with the hint bar's and the quick bar's.
export const say = (text) => (RU ? tr(text, "ru") : (ZH && CONTROLS_ZH[text]) || text);
