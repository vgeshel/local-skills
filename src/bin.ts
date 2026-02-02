export {}

if (!process.stdout.isTTY) {
  process.env.NO_COLOR = '1'
}

const { createProgram } = await import('./cli.js')

const program = createProgram()
program.parse()
