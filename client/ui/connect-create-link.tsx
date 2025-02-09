import { onEvent } from "../util.ts";

export const linkForms = (connectForm: Element, creationForm: Element) => {
  connectForm.append(
    <p>
      don't have a session id? you might want to{" "}
      <a
        _tap={onEvent("click", e => {
          e.preventDefault();
          connectForm.parentElement!.append(creationForm);
          connectForm.remove();
        })}
        href="javascript:void(0)"
      >
        create a session
      </a>
      .
    </p>,
  );

  creationForm.append(
    <p>
      already have a session? you might want to{" "}
      <a
        _tap={onEvent("click", e => {
          e.preventDefault();
          creationForm.parentElement!.append(connectForm);
          creationForm.remove();
        })}
        href="javascript:void(0)"
      >
        join a session
      </a>
      .
    </p>,
  );
};
