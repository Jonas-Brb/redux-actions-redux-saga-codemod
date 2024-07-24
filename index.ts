import * as ts from 'typescript'

import { createImportsTransformerFactory } from './importsTransformer'
import { global } from './shared/global'
import * as utils from './shared/utils'
import { createTakeLatestTransformerFactory } from './takeLatestTransformer'

console.clear()

function getTransformers(program: ts.Program): ts.TransformerFactory<ts.Node>[] {
  return [createTakeLatestTransformerFactory(program), createImportsTransformerFactory(program)].filter(Boolean)
}

async function main() {
  const compilerOptions = utils.getCompilerOptions('tsconfig.noncomposite.json')

  const allFiles = utils.findFiles('./src', ['src/index.tsx'])

  let program: ts.Program = ts.createProgram(allFiles, compilerOptions)

  if (program.getTypeChecker() !== program.getTypeChecker()) {
    console.log('type checkers not equal')

    return
  }

  // first pass
  for (const sourceFile of utils.getSourceFiles(program)) {
    ts.transform(sourceFile, getTransformers(program))
  }

  // prepare for second pass
  {
    console.clear()
    utils.prepareToPreserveEmptyLinesBeforeTransformation(global.importsToAddCache)
    global.COUNTER_HANDLED = 0
    global.COUNTER_SKIPPED = 0
    global.importsToAddCache.resetCache()
    global.importsToRemoveCache.resetCache()
  }

  // reread source files and reinit type checker
  program = ts.createProgram(allFiles, compilerOptions)

  // second pass
  for (const sourceFile of utils.getSourceFiles(program)) {
    const transformationResult = ts.transform(sourceFile, getTransformers(program))
    const transformedSourceFile = transformationResult.transformed[0]

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, omitTrailingSemicolon: false, removeComments: false })
    const transformedCode = printer.printNode(ts.EmitHint.Unspecified, transformedSourceFile, undefined)

    utils.persistTransformation(global.importsToAddCache, transformedSourceFile, sourceFile, transformedCode)
  }

  await utils.lint(global.importsToAddCache.getKeys())

  if (global.DEBUG) {
    console.log(`matched and handled ${global.COUNTER_HANDLED}`)
    console.log(`matched but skipped ${global.COUNTER_SKIPPED}`)
  }
}

main().catch(error => {
  process.exitCode = 1
  console.error(error)
})
