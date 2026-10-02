// Which strings an expression can be.
//
// t("title") asks for one key. t(cond ? "a" : "b"), t(STATUS_LABEL[status])
// and t(tab.label) ask for a few known keys too: the type checker and the
// declarations say which. This follows an expression to where its value
// comes from (a literal, a conditional, a const table, the parameter of a
// .map() callback, a destructured property, what a local function returns,
// a template literal type) and lists every string it can be.
//
// Two checks read it:
//   gen-route-messages.mjs   which messages a page's client components use
//   check-keys.mjs           that every key asked for exists in the catalog
//
// `strings(node)` answers [{ text, open }] ("open" = anything starting with
// `text`), or null when the value cannot be followed to its source.

import ts from "typescript";

export function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAwaitExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

export function createKeyResolver(checker) {
  const MAX_KEYS = 400;
  const MAX_DEPTH = 12;

  // A possible string: `text`, or anything starting with `text` when open.
  const exact = (text) => ({ text, open: false });

  function union(lists) {
    const out = [];
    for (const list of lists) {
      if (!list) return null;
      out.push(...list);
    }
    return out;
  }

  function stringsOfType(type) {
    if (type.isStringLiteral()) return [exact(type.value)];
    // `placeSetup.${string}`: anything that starts so
    if (type.flags & ts.TypeFlags.TemplateLiteral && type.texts?.[0]) {
      return [{ text: type.texts[0], open: true }];
    }
    if (type.isUnion()) {
      const out = [];
      for (const member of type.types) {
        if (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))
          continue;
        const inner = stringsOfType(member);
        if (!inner) return null;
        out.push(...inner);
      }
      return out.length && out.length <= MAX_KEYS ? out : null;
    }
    return null;
  }

  /** The strings an expression can be, from its own shape or its type. */
  function directStrings(node, depth) {
    if (ts.isStringLiteralLike(node)) return [exact(node.text)];
    if (ts.isTemplateExpression(node)) {
      let items = [exact(node.head.text)];
      for (const span of node.templateSpans) {
        const inner = strings(span.expression, depth + 1);
        const next = [];
        for (const item of items) {
          if (item.open) next.push(item);
          else if (!inner) next.push({ text: item.text, open: true });
          else {
            for (const piece of inner) {
              next.push(
                piece.open
                  ? { text: item.text + piece.text, open: true }
                  : exact(item.text + piece.text + span.literal.text),
              );
            }
          }
        }
        if (next.length > MAX_KEYS) return null;
        items = next;
      }
      return items;
    }
    try {
      return stringsOfType(checker.getTypeAtLocation(node));
    } catch {
      return null; // a file outside the program
    }
  }

  /** Every string `node` can evaluate to, or null when that is unknown. */
  function strings(node, depth = 0) {
    const found = origins(node, depth);
    if (!found) return null;
    const out = [];
    for (const origin of found) {
      if (!origin.strings) return null; // an object or a list, not a key
      out.push(...origin.strings);
    }
    return out.length <= MAX_KEYS ? out : null;
  }

  const declarationOf = (identifier) => {
    let symbol;
    try {
      symbol = checker.getSymbolAtLocation(identifier);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
    } catch {
      return null;
    }
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
  };

  const isConst = (declaration) =>
    Boolean(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const);

  const propertyName = (name) =>
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name)
      ? name.text
      : null;

  /**
   * Where the value of an expression comes from: object literals, array
   * literals, { strings }, { array: origins } or { tuple: [origins, …] }.
   * null when it cannot be followed to its source.
   */
  function origins(input, depth = 0) {
    const node = unwrap(input);
    if (!node || depth > MAX_DEPTH) return null;
    if (
      ts.isObjectLiteralExpression(node) ||
      ts.isArrayLiteralExpression(node)
    ) {
      return [node];
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) return [];
    if (ts.isIdentifier(node) && node.text === "undefined") return [];
    const direct = directStrings(node, depth);
    if (direct) return [{ strings: direct }];
    if (ts.isConditionalExpression(node)) {
      return union([
        origins(node.whenTrue, depth + 1),
        origins(node.whenFalse, depth + 1),
      ]);
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return union([
        origins(node.left, depth + 1),
        origins(node.right, depth + 1),
      ]);
    }
    if (ts.isIdentifier(node)) return originsOfIdentifier(node, depth + 1);
    if (ts.isPropertyAccessExpression(node)) {
      const base = origins(node.expression, depth + 1);
      return base && member(base, node.name.text, depth + 1);
    }
    if (ts.isElementAccessExpression(node)) {
      const base = origins(node.expression, depth + 1);
      return base && elements(base, depth + 1);
    }
    if (ts.isCallExpression(node)) return originsOfCall(node, depth + 1);
    return null;
  }

  /** `base.name` */
  function member(base, name, depth) {
    const out = [];
    for (const origin of base) {
      if (
        origin.strings ||
        origin.array ||
        origin.tuple ||
        !ts.isObjectLiteralExpression(origin)
      ) {
        return null;
      }
      for (const property of origin.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = origins(property.expression, depth + 1);
          const inner = spread && member(spread, name, depth + 1);
          if (!inner) return null;
          out.push(...inner);
          continue;
        }
        const key = property.name ? propertyName(property.name) : null;
        if (key === null) return null; // a computed name could be this one
        if (key !== name) continue;
        if (ts.isPropertyAssignment(property)) {
          const inner = origins(property.initializer, depth + 1);
          if (!inner) return null;
          out.push(...inner);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          const inner = originsOfIdentifier(property.name, depth + 1, true);
          if (!inner) return null;
          out.push(...inner);
        } else return null; // a method or an accessor
      }
    }
    return out;
  }

  /** `base[anything]`: every value an object or a list holds. */
  function elements(base, depth) {
    const out = [];
    for (const origin of base) {
      if (origin.array) {
        out.push(...origin.array);
        continue;
      }
      if (origin.strings || origin.tuple) return null;
      if (ts.isObjectLiteralExpression(origin)) {
        for (const property of origin.properties) {
          let inner = null;
          if (ts.isSpreadAssignment(property)) {
            const spread = origins(property.expression, depth + 1);
            inner = spread && elements(spread, depth + 1);
          } else if (ts.isPropertyAssignment(property)) {
            inner = origins(property.initializer, depth + 1);
          } else if (ts.isShorthandPropertyAssignment(property)) {
            inner = originsOfIdentifier(property.name, depth + 1, true);
          }
          if (!inner) return null;
          out.push(...inner);
        }
        continue;
      }
      for (const element of origin.elements) {
        let inner;
        if (ts.isSpreadElement(element)) {
          const spread = origins(element.expression, depth + 1);
          inner = spread && elements(spread, depth + 1);
        } else inner = origins(element, depth + 1);
        if (!inner) return null;
        out.push(...inner);
      }
    }
    return out;
  }

  /** `[a, b] = base`: what sits at one position. */
  function position(base, index, depth) {
    const out = [];
    for (const origin of base) {
      if (origin.tuple) {
        if (!origin.tuple[index]) return null;
        out.push(...origin.tuple[index]);
        continue;
      }
      if (
        origin.strings ||
        origin.array ||
        !ts.isArrayLiteralExpression(origin)
      ) {
        return null;
      }
      const element = origin.elements[index];
      if (!element || ts.isSpreadElement(element)) return null;
      const inner = origins(element, depth + 1);
      if (!inner) return null;
      out.push(...inner);
    }
    return out;
  }

  const ITERATORS = new Set([
    "map",
    "forEach",
    "filter",
    "find",
    "findLast",
    "findIndex",
    "some",
    "every",
    "flatMap",
    "sort",
    "toSorted",
  ]);
  const SAME_LIST = new Set([
    "filter",
    "slice",
    "sort",
    "toSorted",
    "reverse",
    "toReversed",
  ]);
  const ONE_OF = new Set(["find", "findLast", "at"]);

  /** A parameter of `list.map((item) => …)` is one of the list's values. */
  function originsOfParameter(parameter, depth) {
    const fn = parameter.parent;
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
    let call = fn.parent;
    while (call && ts.isParenthesizedExpression(call)) call = call.parent;
    if (
      !call ||
      !ts.isCallExpression(call) ||
      !call.arguments.includes(fn) ||
      !ts.isPropertyAccessExpression(call.expression)
    ) {
      return null;
    }
    const method = call.expression.name.text;
    const index = fn.parameters.indexOf(parameter);
    const isItem =
      (ITERATORS.has(method) && (index === 0 || method.endsWith("ort"))) ||
      (method === "reduce" && index === 1);
    if (!isItem) return null;
    const list = origins(call.expression.expression, depth + 1);
    return list && elements(list, depth + 1);
  }

  /** What a `{ a, b: [c] }` binding element is bound to. */
  function originsOfBinding(element, depth) {
    if (element.dotDotDotToken) return null;
    const pattern = element.parent;
    const holder = pattern.parent;
    let source = null;
    if (ts.isVariableDeclaration(holder)) {
      if (!isConst(holder) || !holder.initializer) return null;
      source = origins(holder.initializer, depth + 1);
    } else if (ts.isParameter(holder)) {
      source = originsOfParameter(holder, depth + 1);
    } else if (ts.isBindingElement(holder)) {
      source = originsOfBinding(holder, depth + 1);
    }
    if (!source) return null;
    let found;
    if (ts.isObjectBindingPattern(pattern)) {
      const key = propertyName(element.propertyName ?? element.name);
      if (key === null) return null;
      found = member(source, key, depth + 1);
    } else {
      found = position(source, pattern.elements.indexOf(element), depth + 1);
    }
    if (!found) return null;
    if (element.initializer) {
      const fallback = origins(element.initializer, depth + 1);
      if (!fallback) return null;
      return [...found, ...fallback];
    }
    return found;
  }

  function originsOfIdentifier(identifier, depth, shorthand = false) {
    let declaration;
    if (shorthand) {
      try {
        const symbol = checker.getShorthandAssignmentValueSymbol(
          identifier.parent,
        );
        declaration =
          symbol?.valueDeclaration ?? symbol?.declarations?.[0] ?? null;
      } catch {
        return null;
      }
    } else declaration = declarationOf(identifier);
    if (!declaration) return null;
    if (ts.isVariableDeclaration(declaration)) {
      if (!isConst(declaration) || !declaration.initializer) return null;
      return origins(declaration.initializer, depth + 1);
    }
    if (ts.isBindingElement(declaration)) {
      return originsOfBinding(declaration, depth + 1);
    }
    if (ts.isParameter(declaration)) {
      return originsOfParameter(declaration, depth + 1);
    }
    return null;
  }

  /** The expressions a function can return. */
  function returnsOf(fn) {
    if (!fn.body) return null;
    if (!ts.isBlock(fn.body)) return [fn.body];
    const out = [];
    const visit = (node) => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression)
        out.push(node.expression);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(fn.body, visit);
    return out;
  }

  function originsOfCall(call, depth) {
    const callee = unwrap(call.expression);
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      const subject = callee.expression;
      if (ts.isIdentifier(subject) && subject.text === "Object") {
        const of = call.arguments[0] && origins(call.arguments[0], depth + 1);
        if (!of) return null;
        if (method === "values") {
          const values = elements(of, depth + 1);
          return values && [{ array: values }];
        }
        if (method === "keys" || method === "entries") {
          const names = [];
          for (const origin of of) {
            if (origin.strings || origin.array || origin.tuple) return null;
            if (!ts.isObjectLiteralExpression(origin)) return null;
            for (const property of origin.properties) {
              const key = property.name ? propertyName(property.name) : null;
              if (key === null) return null;
              names.push(exact(key));
            }
          }
          const keys = [{ strings: names }];
          if (method === "keys") return [{ array: keys }];
          const values = elements(of, depth + 1);
          return values && [{ array: [{ tuple: [keys, values] }] }];
        }
        return null;
      }
      if (SAME_LIST.has(method)) return origins(subject, depth + 1);
      if (ONE_OF.has(method)) {
        const list = origins(subject, depth + 1);
        return list && elements(list, depth + 1);
      }
      if (method === "map" || method === "flatMap") {
        const fn = call.arguments[0] && unwrap(call.arguments[0]);
        if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) {
          return null;
        }
        const made = union(
          (returnsOf(fn) ?? [null]).map((r) => r && origins(r, depth + 1)),
        );
        return made && [{ array: made }];
      }
      return null;
    }
    if (!ts.isIdentifier(callee)) return null;
    const declaration = declarationOf(callee);
    if (!declaration) return null;
    let fn = null;
    if (ts.isFunctionDeclaration(declaration)) fn = declaration;
    else if (
      ts.isVariableDeclaration(declaration) &&
      isConst(declaration) &&
      declaration.initializer
    ) {
      const value = unwrap(declaration.initializer);
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
        fn = value;
    }
    const returned = fn && returnsOf(fn);
    if (!returned || returned.length === 0) return null;
    return union(returned.map((r) => origins(r, depth + 1)));
  }

  return { strings };
}
