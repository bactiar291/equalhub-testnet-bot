require("dotenv").config();
const { ethers } = require("ethers");
const prompts = require("prompts");
const chalk = require("chalk");
const readline = require("readline");

const RPC_URL = process.env.RPC_URL;
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const GAS_LIMIT = 113807;
const GAS_PRICE = ethers.BigNumber.from("1200304");

const poolAbi = ["function addLiquidity(uint256[] amounts, uint256 minMintAmount)"];
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const tokens = [
  { name: "USDC", address: "0x47725537961326e4b906558BD208012c6C11aCa2", pool: "0xb5de5Fa6436AE3a7E396eF53E0dE0FC5208f61a4", index: 0 },
  { name: "USDT", address: "0x60EFCa24B785391C6063ba37fF917Ff0edEb9f4a", pool: "0xb5de5Fa6436AE3a7E396eF53E0dE0FC5208f61a4", index: 1 },
  { name: "HKDA", address: "0xE8bbE0E706EbDaB3Be224edf2FE6fFff16df1AC1", pool: "0x092fadf3fa0c2a721c0ed51f4b271a0d139191b8", index: 0 },
  { name: "HKDB", address: "0x779CA066b69F4B39cD77bA1a1C4d3c5c097A441e", pool: "0x092fadf3fa0c2a721c0ed51f4b271a0d139191b8", index: 1 }
];

function randomAmount() {
  const min = 0.01;
  const max = 0.02;
  const rand = Math.random() * (max - min) + min;
  return parseFloat(rand.toFixed(6));
}

function clearTerminal() {
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  console.log(chalk.cyanBright.bold("EQUALHUB TESTNET - ADD LIQ PAIR USDC + USDT + HKDA + HKDB"));
  console.log(chalk.greenBright("---------- bactiar291 ----------\n"));
}

async function approveIfNeeded(token, spender, symbol) {
  const allowance = await token.allowance(signer.address, spender);
  if (allowance.eq(0)) {
    const tx = await token.approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
    console.log(chalk.yellow(`${symbol} approved to ${spender}`));
  }
}

async function addLiqToPool(poolAddress, amounts, label) {
  try {
    const iface = new ethers.utils.Interface(poolAbi);
    const data = iface.encodeFunctionData("addLiquidity", [amounts, 0]);
    const tx = await signer.sendTransaction({
      to: poolAddress,
      data,
      gasLimit: GAS_LIMIT,
      gasPrice: GAS_PRICE,
      type: 0
    });
    const receipt = await tx.wait();
    return receipt.status === 1
      ? { success: true, txHash: tx.hash }
      : { success: false, txHash: tx.hash, error: "TX reverted" };
  } catch (err) {
    return { success: false, error: err.message || "Unknown Error" };
  }
}

async function start() {
  const response = await prompts({
    type: 'number',
    name: 'sessionCount',
    message: 'Berapa sesi add liquidity yang ingin dijalankan?',
    validate: val => val > 0 ? true : 'Minimal 1 sesi'
  });

  const sessionCount = response.sessionCount;
  if (!sessionCount) return;

  const tokenContracts = {};
  for (const t of tokens) {
    const contract = new ethers.Contract(t.address, erc20Abi, signer);
    t.decimals = await contract.decimals();
    tokenContracts[t.name] = contract;
    await approveIfNeeded(contract, t.pool, t.name);
  }

  for (let session = 1; session <= sessionCount; session++) {
    clearTerminal();
    console.log(chalk.magenta(`Sesi ${session} dari ${sessionCount}\n`));

    for (const poolAddress of [...new Set(tokens.map(t => t.pool))]) {
      const amounts = [];
      const tokensInPool = tokens.filter(t => t.pool === poolAddress);
      const maxIndex = Math.max(...tokensInPool.map(t => t.index));
      for (let i = 0; i <= maxIndex; i++) amounts.push(0);

      for (const t of tokensInPool) {
        const token = tokenContracts[t.name];
        const rawAmount = randomAmount();
        const amt = ethers.utils.parseUnits(rawAmount.toString(), t.decimals);
        const balBefore = await token.balanceOf(signer.address);

        if (balBefore.gte(amt)) {
          amounts[t.index] = amt;
          const result = await addLiqToPool(poolAddress, [...amounts], t.name);
          const balAfter = await token.balanceOf(signer.address);

          const beforeFmt = parseFloat(ethers.utils.formatUnits(balBefore, t.decimals));
          const afterFmt = parseFloat(ethers.utils.formatUnits(balAfter, t.decimals));
          const delta = (beforeFmt - afterFmt).toFixed(6);

          if (result.success) {
            console.log(`${chalk.bold(t.name)} → Add: ${chalk.green(rawAmount)} | ${chalk.green("SUCCESS")}`);
            console.log(`Saldo: ${chalk.gray(beforeFmt)} → ${chalk.gray(afterFmt)} (berkurang: ${chalk.yellow(delta)})`);
            console.log(`TX: ${chalk.gray(result.txHash)}\n`);
          } else {
            console.log(`${chalk.bold(t.name)} → Add: ${chalk.red(rawAmount)} | ${chalk.red("FAILED")}`);
            console.log(`Error: ${chalk.red(result.error)}\n`);
          }

          await new Promise(r => setTimeout(r, 2000));
          amounts[t.index] = 0;
        } else {
          console.log(chalk.red(`${t.name} saldo tidak cukup. Skip.\n`));
        }
      }
    }

    if (session !== sessionCount) await new Promise(r => setTimeout(r, 3000));
  }

  console.log(chalk.greenBright.bold(`\n✅ Semua sesi selesai.`));
}

start().catch(console.error);
