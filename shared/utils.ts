/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/member-ordering */
import { ESLint } from 'eslint'
import * as fs from 'fs'
import * as minimatch from 'minimatch'
import * as path from 'path'
import * as ts from 'typescript'

import { global } from './global'
import { isPatternArgumentIdentifier } from './predicates'

export class Cache<T extends ts.Node> {
  private cache: { [sourceFile: string]: T[] } = {}

  constructor() {}

  getKeys() {
    return Object.keys(this.cache)
  }

  getValue(key: string) {
    return this.cache[key] ?? []
  }

  addValue(key: string, value: T) {
    const values = this.cache[key] ?? []
    this.cache[key] = ~values.indexOf(value) ? values : [...values, value]
  }

  setValues(key: string, values: T[]) {
    this.cache[key] = values
  }

  clearValues() {
    for (const key in this.cache) {
      this.cache[key] = []
    }
  }

  resetCache() {
    for (const key in this.cache) {
      delete this.cache[key]
    }
  }
}

export function getDepth(node: ts.Node): number {
  let depth = 0

  while (node.parent) {
    depth++
    node = node.parent
  }

  return depth
}

export function log(node: ts.Node) {
  console.log(ts.SyntaxKind[node.kind])
}

export function logLeaf(node: ts.Node) {
  console.log(`${' '.repeat(getDepth(node) * 2)}${ts.SyntaxKind[node.kind]}`)
}

export function stringifyCircular(value: any): string {
  const cache: any[] = []

  return JSON.stringify(
    value,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.includes(value) || key === 'parent') return
        cache.push(value)
      }

      return value
    },
    2
  )
}

export function findFiles(dir: string, searchPatterns: string[], fileList: string[] = []) {
  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath) // 1

    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      findFiles(filePath, searchPatterns, fileList)
    } else {
      for (const pattern of searchPatterns) {
        if (minimatch(filePath, pattern)) {
          fileList.push(filePath)
          break
        }
      }
    }
  })

  return fileList
}

export async function lint(patterns: string[]) {
  const eslint = new ESLint({ fix: true })
  const results = await eslint.lintFiles(patterns)

  await ESLint.outputFixes(results)

  const formatter = await eslint.loadFormatter('stylish')
  const resultText = formatter.format(results)

  console.log(resultText)
}

export function getCompilerOptions(configName: string) {
  const configFileName = ts.findConfigFile('./', ts.sys.fileExists, configName)!
  const configFile = ts.readConfigFile(configFileName, ts.sys.readFile)
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configFileName))

  return config.options
}

export function getSourceFiles(program: ts.Program) {
  const ignoreList = ['node_modules', '@src/packages']

  // return [program.getSourceFile('src/domain/rtcStatistics/sagas.ts')!]
  return [...program.getSourceFiles()]
    .filter(sourceFile => ignoreList.every(segment => !sourceFile.fileName.includes(segment)))
    .sort(({ fileName: a }, { fileName: b }) => (a > b ? 1 : a < b ? -1 : 0))
}

export function printCompilerOptions(program: ts.Program) {
  fs.writeFileSync('./compilerOptions.json', stringifyCircular(program.getCompilerOptions()))
}

export function prepareToPreserveEmptyLinesBeforeTransformation(cache: Cache<any>) {
  const files = cache.getKeys()
  files.forEach(file => {
    const sourceCode = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, sourceCode.replace(/^\s*$/gm, '// EMPTY_LINE'))
  })
}

export function persistTransformation(
  cache: Cache<any>,
  transformedSourceFile: ts.Node,
  sourceFile: ts.SourceFile,
  transformedCode: string
) {
  if (cache.getKeys().includes(transformedSourceFile.getSourceFile().fileName)) {
    fs.writeFileSync(sourceFile.fileName, transformedCode.replace(/\/\/ EMPTY_LINE/g, '\n'))
  }
}

export function getImportPath(filename: string, importFrom: string): string {
  const relativePath = path
    .relative(path.dirname(filename), importFrom)
    .replace(/\.ts$/, '')
    .replace(/\.tsx$/, '')

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

export function getAliasedSymbol(node: ts.Identifier, program: ts.Program) {
  const typeChecker = program.getTypeChecker()

  let symbol = typeChecker.getSymbolAtLocation(node)
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    symbol = typeChecker.getAliasedSymbol(symbol)
  }

  return symbol
}

export const findParent = <T extends ts.Node>(node: ts.Node, predicate: (node: ts.Node) => node is T): T | undefined => {
  if (!node.parent) {
    return undefined
  }

  if (predicate(node.parent)) {
    return node.parent
  }

  return findParent(node.parent, predicate)
}

export function isCallExpressionByText(node: ts.Node, text: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === text
}

export function findCreateActionCallExpression(
  symbolToMatch: ts.Symbol | undefined,
  context: ts.TransformationContext,
  program: ts.Program
): ts.CallExpression | undefined {
  if (!symbolToMatch) {
    return
  }

  let createSelectorCallExpression: ts.CallExpression | undefined

  for (const sourceFile of program.getSourceFiles()) {
    if (createSelectorCallExpression) {
      break
    }

    if (sourceFile) {
      if (!sourceFile.isDeclarationFile) {
        const visitor: ts.Visitor = node => {
          if (createSelectorCallExpression) {
            return node
          }

          if (isCallExpressionByText(node, 'createAction')) {
            const argument = node.arguments[0]

            if (isPatternArgumentIdentifier(argument)) {
              const symbol = getAliasedSymbol(argument, program)

              if (symbol === symbolToMatch) {
                createSelectorCallExpression = node

                return node
              }
            }
          }

          return ts.visitEachChild(node, visitor, context)
        }

        ts.visitNode(sourceFile, visitor)
      }
    }
  }

  return createSelectorCallExpression
}

export function findCreateActionsCallExpression(
  symbolToMatch: ts.Symbol | undefined,
  context: ts.TransformationContext,
  program: ts.Program
): ts.CallExpression | undefined {
  if (!symbolToMatch) {
    return
  }

  let createSelectorCallExpression: ts.CallExpression | undefined

  for (const sourceFile of program.getSourceFiles()) {
    if (createSelectorCallExpression) {
      break
    }

    if (sourceFile) {
      if (!sourceFile.isDeclarationFile) {
        const visitor: ts.Visitor = node => {
          if (createSelectorCallExpression) {
            return node
          }

          if (isCallExpressionByText(node, 'createAction')) {
            const actionMapArgument = node.arguments[0]
            const actionMapArgumentKeys = ts.isObjectLiteralExpression(actionMapArgument)
              ? actionMapArgument.properties
                  .map(property => {
                    if (ts.isPropertyAssignment(property)) {
                      if (ts.isComputedPropertyName(property.name) && ts.isIdentifier(property.initializer)) {
                        if (isPatternArgumentIdentifier(property.name.expression)) {
                          return property.name.expression
                        }
                      }
                    }

                    return undefined!
                  })
                  .filter(isPatternArgumentIdentifier)
              : []
            const identityActionsArguments = node.arguments.slice(1).filter(isPatternArgumentIdentifier)

            const actionTypeIdentifiers = [...actionMapArgumentKeys, ...identityActionsArguments]
            const actionTypeIdentifier = actionTypeIdentifiers.find(identifier => {
              const symbol = getAliasedSymbol(identifier, program)

              return symbol === symbolToMatch
            })

            if (actionTypeIdentifier) {
              const variableDeclaration = findParent(node, ts.isVariableDeclaration)
              if (variableDeclaration) {
                const variableStatement = findParent(variableDeclaration, ts.isVariableStatement)
                if (variableStatement) {
                  if (ts.isObjectBindingPattern(variableDeclaration.name)) {
                    variableDeclaration.name.elements.find(element => {
                      if (ts.isBindingElement(element)) {
                        if (ts.isIdentifier(element.name)) {
                          const symbol = getAliasedSymbol(actionTypeIdentifier, program)
                          // TODO
                          if (element.name.text === transformCase('')) {
                            // TODO
                          }
                        }
                      }
                    })
                  }
                }
              }
            }
            createSelectorCallExpression = node

            return node

            // return 'something'
          }

          return ts.visitEachChild(node, visitor, context)
        }

        ts.visitNode(sourceFile, visitor)
      }
    }
  }

  return createSelectorCallExpression
}

export function findVariableStatement(node: ts.CallExpression | undefined) {
  if (node) {
    const variableStatement = findParent(node, ts.isVariableStatement)
    if (variableStatement?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      return variableStatement
    }
  }
}

export function findPropertyAssignment(node: ts.CallExpression | undefined) {
  if (node) {
    const propertyAssignment = findParent(node, ts.isPropertyAssignment)

    return propertyAssignment
  }
}

export function storeImportToRemove(program: ts.Program, node: ts.Identifier, sourceFile: ts.SourceFile) {
  const typeChecker = program.getTypeChecker()
  const importSpecifierToRemove = typeChecker.getSymbolAtLocation(node)?.declarations?.find(ts.isImportSpecifier)!
  const identifierToRemove = importSpecifierToRemove?.propertyName ?? importSpecifierToRemove.name
  global.importsToRemoveCache.addValue(sourceFile.fileName, identifierToRemove)
}

/*
handleAction.*?\((\n\s+)*[A-Z_]+,
*/

function transformCase(str: string): string {
  return str
    .replace('[', '')
    .replace(']', '')
    .replace(' ', '_')
    .split('_')
    .map((value, index) => (index === 0 ? value : `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`))
    .join()
}
