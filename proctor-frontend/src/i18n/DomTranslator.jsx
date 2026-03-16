import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { translateSourceText } from "./catalog";

const TEXT_MARK = "__proctorOriginalText";
const ATTR_MARKS = {
  placeholder: "__proctorOriginalPlaceholder",
  title: "__proctorOriginalTitle",
  "aria-label": "__proctorOriginalAriaLabel",
  alt: "__proctorOriginalAlt",
};

const TRANSLATABLE_ATTRIBUTES = Object.keys(ATTR_MARKS);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

function preserveWhitespace(text, language) {
  const source = String(text ?? "");
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return source;
  return `${match[1]}${translateSourceText(match[2], language)}${match[3]}`;
}

function shouldSkip(parentElement) {
  if (!parentElement) return true;
  if (SKIP_TAGS.has(parentElement.tagName)) return true;
  return Boolean(parentElement.closest("[data-i18n-skip='true']"));
}

function translateTextNode(node, language) {
  const parentElement = node.parentElement;
  if (shouldSkip(parentElement)) return;

  const currentValue = node.nodeValue || "";
  if (/[\u3400-\u9FFF]/.test(currentValue)) {
    node[TEXT_MARK] = currentValue;
  }

  const sourceValue = node[TEXT_MARK] ?? currentValue;
  const translated = preserveWhitespace(sourceValue, language);
  if (translated !== currentValue) {
    node.nodeValue = translated;
  }
}

function translateAttributes(element, language) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
  if (element.closest?.("[data-i18n-skip='true']")) return;

  TRANSLATABLE_ATTRIBUTES.forEach((attr) => {
    const value = element.getAttribute(attr);
    if (!value) return;

    const marker = ATTR_MARKS[attr];
    if (/[\u3400-\u9FFF]/.test(value)) {
      element[marker] = value;
    }

    const sourceValue = element[marker] ?? value;
    const translated = preserveWhitespace(sourceValue, language);
    if (translated !== value) {
      element.setAttribute(attr, translated);
    }
  });
}

function translateSubtree(rootNode, language) {
  if (!rootNode || typeof document === "undefined") return;
  const root = rootNode.nodeType === Node.TEXT_NODE ? rootNode.parentNode : rootNode;
  if (!root) return;

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateAttributes(root, language);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    translateTextNode(current, language);
    current = walker.nextNode();
  }

  if (root.querySelectorAll) {
    root.querySelectorAll("*").forEach((element) => translateAttributes(element, language));
  }
}

export default function DomTranslator() {
  const { i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    let frameId = 0;
    const schedule = (root = document.body) => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        translateSubtree(root, i18n.language);
        frameId = 0;
      });
    };

    schedule(document.body);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          schedule(mutation.target);
        } else {
          schedule(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });

    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [i18n.language, location.pathname]);

  return null;
}
