import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Server } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@voya/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollableDialogContent,
} from "@voya/ui/components/dialog";
import { useI18n } from "@voya/i18n/use-i18n";
import type { ProfileListItem_Serialize } from "@/ipc/bindings";

import { CONFIG_TYPES, PROFILE_PROTOCOLS, type ProfileProtocol } from "./profile-constants";
import {
  Panel,
  SelectField,
  TextField,
} from "./profile-form-fields";
import { addressLabel } from "./profile-form-utils";
import {
  createDefaultProfile,
  normalizeProfileForForm,
  prepareProfileForSave,
  profileFormSchema,
  type ParsedProfileFormValues,
  type ProfileFormValues,
} from "./profile-form-schema";
import { MuxPanel } from "./profile-mux-panel";
import { ProtocolPanel } from "./profile-protocol-panel";
import { SecurityPanel } from "./profile-security-panel";
import { TransportPanel } from "./profile-transport-panel";

type ProfileDialogProps = {
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (profile: ReturnType<typeof prepareProfileForSave>) => Promise<void>;
  open: boolean;
  profile?: ProfileListItem_Serialize | null;
};

export function ProfileDialog({ mode, onOpenChange, onSubmit, open, profile }: ProfileDialogProps) {
  const formKey = `${mode}:${profile?.profile.IndexId ?? "new"}:${open ? "open" : "closed"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ProfileDialogForm
        key={formKey}
        mode={mode}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        profile={profile}
      />
    </Dialog>
  );
}

function ProfileDialogForm({
  mode,
  onOpenChange,
  onSubmit,
  profile,
}: Omit<ProfileDialogProps, "open">) {
  const { t } = useI18n();
  const form = useForm<ProfileFormValues, unknown, ParsedProfileFormValues>({
    defaultValues: profile ? normalizeProfileForForm(profile.profile) : createDefaultProfile(),
    mode: "onBlur",
    resolver: zodResolver(profileFormSchema),
  });
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    setValue,
  } = form;
  const configType = Number(useWatch({ control: form.control, name: "ConfigType" })) as ProfileProtocol;
  const security = useWatch({ control: form.control, name: "StreamSecurity" }) ?? "";
  const allowInsecure = useWatch({ control: form.control, name: "AllowInsecure" }) === "true";
  const muxEnabled = useWatch({ control: form.control, name: "MuxEnabled" }) === true;

  const submit = handleSubmit(async (values) => {
    await onSubmit(prepareProfileForSave(values));
  });

  return (
    <ScrollableDialogContent width="68rem">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Server className="size-4" aria-hidden="true" />
          {mode === "edit" ? t("panes.profiles.dialog.editTitle") : t("panes.profiles.dialog.addTitle")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("panes.profiles.dialog.description")}
        </DialogDescription>
      </DialogHeader>

      <form className="min-h-0 overflow-y-auto pe-1" id="profile-form" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4">
          <Panel title={t("panes.profiles.panels.profile")}>
            <div className="grid gap-3 lg:grid-cols-[14rem_1fr]">
              <SelectField
                control={form.control}
                label={t("panes.profiles.fields.protocol")}
                name="ConfigType"
                onValueChange={(value) => {
                  const next = Number(value) as ProfileProtocol;

                  if (next === CONFIG_TYPES.PolicyGroup && !getValues("Address")) {
                    setValue("Address", "group");
                  }
                  if (next === CONFIG_TYPES.ProxyChain && !getValues("Address")) {
                    setValue("Address", "chain");
                  }
                }}
                options={PROFILE_PROTOCOLS}
                parseValue={(value) => Number(value)}
              />

              <TextField error={errors.Remarks?.message} label={t("panes.profiles.fields.remarks")} {...register("Remarks")} />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_7rem_12rem]">
              <TextField error={errors.Address?.message} label={addressLabel(configType, t)} {...register("Address")} />
              <TextField
                error={errors.Port?.message}
                inputMode="numeric"
                label={t("panes.profiles.fields.port")}
                type="number"
                {...register("Port", { valueAsNumber: true })}
              />
              <TextField label={t("panes.profiles.fields.group")} {...register("Subid")} />
            </div>
          </Panel>

          <ProtocolPanel
            configType={configType}
            control={form.control}
            getValues={getValues}
            register={register}
            setValue={setValue}
          />
          <TransportPanel control={form.control} register={register} />
          <SecurityPanel
            control={form.control}
            getValues={getValues}
            register={register}
            security={security}
            setValue={setValue}
          />
          <MuxPanel
            allowInsecure={allowInsecure}
            control={form.control}
            muxEnabled={muxEnabled}
            setAllowInsecure={(enabled) => setValue("AllowInsecure", enabled ? "true" : "false")}
            setMuxEnabled={(enabled) => setValue("MuxEnabled", enabled)}
          />
        </div>
      </form>

      <DialogFooter>
        <Button disabled={isSubmitting} onClick={() => onOpenChange(false)} type="button" variant="outline">
          {t("panes.profiles.dialog.cancel")}
        </Button>
        <Button disabled={isSubmitting} form="profile-form" type="submit">
          <Save className="size-4" aria-hidden="true" />
          {t("panes.profiles.dialog.save")}
        </Button>
      </DialogFooter>
    </ScrollableDialogContent>
  );
}
