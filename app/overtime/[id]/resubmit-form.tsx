"use client";

import { OvertimeForm } from "../new/overtime-form";
import { createResubmission } from "../actions";

type Props = {
  parentId: string;
  userId: string;
  userName: string;
  defaultRequestType: "pre" | "post";
  defaultWorkDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultWorkSiteName: string;
  defaultDescription: string;
  regularEndTime: string;
  workSites: { id: string; name: string }[];
};

export function ResubmitForm(props: Props) {
  return (
    <OvertimeForm
      userId={props.userId}
      userName={props.userName}
      defaultWorkDate={props.defaultWorkDate}
      fixedDefaultWorkDate={props.defaultWorkDate}
      defaultStartTime={props.defaultStartTime}
      defaultEndTime={props.defaultEndTime}
      defaultRequestType={props.defaultRequestType}
      defaultWorkSiteName={props.defaultWorkSiteName}
      defaultDescription={props.defaultDescription}
      warnings={[]}
      regularEndTime={props.regularEndTime}
      workSites={props.workSites}
      parentId={props.parentId}
      submitLabel="再申請する"
      action={createResubmission}
    />
  );
}
