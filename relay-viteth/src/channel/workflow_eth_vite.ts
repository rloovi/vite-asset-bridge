import { ChannelVite } from "./channelVite";
import { ChannelEther } from "./channelEther";
import { wallet } from "@vite/vitejs";
import { ChannelOptions, WorkflowOptions, toJobs } from "./common";
export class WorkflowEthVite {
  channelVite: ChannelVite;
  channelEther: ChannelEther;

  jobs: Map<string, ChannelOptions>;

  constructor(
    channelVite: ChannelVite,
    channelEther: ChannelEther,
    options: WorkflowOptions[]
  ) {
    this.channelEther = channelEther;
    this.channelVite = channelVite;
    this.jobs = toJobs(options, "ether", "vite");
  }

  async step1() {
    let info = await this.channelEther.getInfo("_confirmed");
    if (!info) {
      info = {
        height: "0",
        index: "0",
        txIndex: -1,
        logIndex: -1,
      };
    }

    const { toHeight, inputs } = await this.channelEther.scanConfirmedInputs(
      info.height
    );

    if (!inputs) {
      return;
    }
    const filteredInputs = inputs.filter((x) => {
      if (x.height < info.height) {
        return false;
      } else if (x.height > info.height) {
        return true;
      }

      if (x.txIndex < info.txIndex) {
        return false;
      } else if (x.txIndex > info.txIndex) {
        return true;
      }

      if (x.logIndex < info.logIndex) {
        return false;
      } else if (x.logIndex > info.logIndex) {
        return true;
      }
    });

    if (filteredInputs.length === 0 && BigInt(toHeight) > BigInt(info.height)) {
      await this.channelEther.updateInfo("_confirmed", {
        height: toHeight.toString(),
        index: info.index.toString(),
        txIndex: -1,
        logIndex: -1,
      });
      return;
    }
    if (filteredInputs.length === 0) {
      return;
    }
    const input = filteredInputs[0];
    console.log("input", input);
    if (input.index != (BigInt(info.index) + 1n).toString()) {
      console.warn("index do not match", input.index.toString(), info.index);
      return;
    }

    const destAddress = wallet.getAddressFromOriginalAddress(
      input.event.dest.slice(2)
    );
    console.log(destAddress);
    const result = await this.channelVite.outputIndex();
    if (!result || result.length === 0) {
      return;
    }
    const outputIdx = result[0];
    if (!outputIdx) {
      console.warn("undefined outputIdx");
      return;
    }
    if (BigInt(outputIdx) + 1n > BigInt(input.index)) {
      console.warn("output index skip", outputIdx, input.index.toString());
      await this.channelEther.updateInfo("_confirmed", {
        height: String(input.height),
        index: input.index.toString(),
        txIndex: input.txIndex,
        logIndex: input.logIndex,
      });
      return;
    }
    if (BigInt(outputIdx) + 1n != BigInt(input.index)) {
      console.warn("output index error", outputIdx, input.index.toString());
      return;
    }
    await this.channelVite.approveAndExecOutput(
      input.inputHash,
      destAddress,
      input.event.value.toString()
    );

    await this.channelEther.updateInfo("_confirmed", {
      height: String(input.height),
      index: input.index.toString(),
      txIndex: input.txIndex,
      logIndex: input.logIndex,
    });
  }

  async step2() {}
}
