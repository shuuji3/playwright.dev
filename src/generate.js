/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

//@ts-check

const fs = require('fs');
const path = require('path');
const https = require('https');
const chokidar = require('chokidar');
const { Generator } = require('./generator');
const { JavaScriptFormatter } = require('./format_js');
const { PythonFormatter } = require('./format_python');
const { JavaFormatter } = require('./format_java');
const { CSharpFormatter } = require('./format_csharp');

const isWatch = process.argv.includes('--watch');
const watchProject = process.argv[3];

const srcDir = path.join(process.env.SRC_DIR || '../playwright', 'docs', 'src');

const lang2Folder = {
  'js': 'nodejs',
  'python': 'python',
  'java': 'java',
  'csharp': 'dotnet',
}

async function generateDocsForLanguages () {
  new Generator('js', srcDir, path.join(__dirname, '..', 'nodejs', 'docs'), new JavaScriptFormatter());
  new Generator('python', srcDir, path.join(__dirname, '..', 'python', 'docs'), new PythonFormatter());
  new Generator('java', srcDir, path.join(__dirname, '..', 'java', 'docs'), new JavaFormatter());
  new Generator('csharp', srcDir, path.join(__dirname, '..', 'dotnet', 'docs'), new CSharpFormatter());
};

/**
 * @param {'add'|'addDir'|'change'|'unlink'|'unlinkDir'} event 
 * @param {string} from 
 */
async function syncWithWorkingDirectory (event, from) {
  const to = path.join(path.join(__dirname, '..', path.relative(path.join(__dirname, '..', lang2Folder[watchProject]), from)));
  switch (event) {
    case 'addDir':
      if (!fs.existsSync(to))
        fs.mkdirSync(to);
      break;
    case 'add':
    case 'change':
      fs.copyFileSync(from, to);
      break;
    case 'unlink':
      fs.unlinkSync(to);
    case 'unlinkDir':
      fs.rmdirSync(to);
      break;
  }
}

(async () => {
  if (isWatch) {
    chokidar.watch(srcDir, { ignoreInitial: true }).on('all', (event, path) => {
      generateDocsForLanguages().catch((error) => {
        console.error(`Error auto syncing docs (generating): ${error}`);
      })
    });
    chokidar.watch(path.join(__dirname, '..', lang2Folder[watchProject])).on('all', (event, path) => {
      syncWithWorkingDirectory(event, path).catch(error => {
        console.error(`Error auto syncing docs (mirroring): ${error}`);
      })
    });
    await generateDocsForLanguages();
  } else {
    await generateDocsForLanguages();
    await updateStarsButton();
  }

})().catch(error => {
  console.error(error);
  process.exit(1);
});

async function updateStarsButton() {
  const kMagicComment = '// NOTE: this line is generated by src/generate.js. Do not change!';
  const kGitHubStarsButtonSource = path.join(__dirname, 'components/GitHubStarButton/index.tsx');
  const repoInfoResponse = await new Promise((resolve, reject) => {
    https.get('https://api.github.com/repos/microsoft/playwright', {
      headers: {
        'User-Agent': 'playwright-docs-generator',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300)
          resolve(JSON.parse(data));
        else
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
      })
      res.on('error', (error) => reject(error))
    });
  });
  const roundedStarsCount = Math.floor(repoInfoResponse.stargazers_count / 1000);
  let lines = (await fs.promises.readFile(kGitHubStarsButtonSource, 'utf8')).split('\n');
  const starLineIndex = lines.findIndex(line => line.includes(kMagicComment));
  lines[starLineIndex] = `const STARS = '${roundedStarsCount}k+'; ${kMagicComment}`;
  await fs.promises.writeFile(kGitHubStarsButtonSource, lines.join('\n'));
}
