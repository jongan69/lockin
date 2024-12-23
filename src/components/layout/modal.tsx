import { Button, ButtonState } from "@components/home/button";
import { DEFAULT_WALLET } from "@utils/globals";
import React from "react";

type Props = {
  onClick: Function;
  butttonState: ButtonState;
  headerContent: string;
  buttonContent: string;
  isToken?: boolean;
  id: string;
};

export const Modal: React.FC<Props> = ({
  onClick,
  butttonState,
  headerContent,
  buttonContent,
  isToken = false,
  id,
}) => {
  return (
    <dialog id={id} className="modal modal-bottom sm:modal-middle">
      <div className="modal-box bg-base-200 shadow-lg border border-base-300">
        <h3 className="font-bold text-2xl mb-6 text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          {headerContent}
        </h3>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Recipient Address</span>
            </label>
            <input
              type="text"
              placeholder="Enter Solana address"
              className="input input-bordered w-full focus:input-primary"
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount</span>
            </label>
            <input
              type="number"
              placeholder={`Enter amount in ${isToken ? "LOCKIN" : "SOL"}`}
              className="input input-bordered w-full focus:input-primary"
            />
          </div>
        </div>
        <div className="modal-action">
          <form method="dialog" className="flex space-x-2 w-full">
            <button className="btn btn-ghost flex-1">Cancel</button>
            <button
              onClick={onClick({ isToken })}
              className={`btn btn-primary flex-1 ${
                butttonState === "loading" ? "loading" : ""
              }`}
            >
              {buttonContent}
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
};
