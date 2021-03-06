import Config from '../config';
import {
  getScope,
  getDataAttribute,
  isObject,
  toArray,
  find,
  getPath,
  hasPath,
  isNullOrUndefined,
  isCallable,
  deepParseInt,
  fillRulesFromElement,
} from './utils';

/**
 * Generates the options required to construct a field.
 */
export default class Generator {
  static generate (el, binding, vnode) {
    const model = Generator.resolveModel(binding, vnode);
    const options = Config.resolve(vnode.context);

    return {
      name: Generator.resolveName(el, vnode),
      el: el,
      listen: !binding.modifiers.disable,
      scope: Generator.resolveScope(el, binding, vnode),
      vm: Generator.makeVM(vnode.context),
      expression: binding.value,
      component: vnode.componentInstance,
      classes: options.classes,
      classNames: options.classNames,
      getter: Generator.resolveGetter(el, vnode, model),
      events: Generator.resolveEvents(el, vnode) || options.events,
      model,
      delay: Generator.resolveDelay(el, vnode, options),
      rules: Generator.resolveRules(el, binding, vnode),
      initial: !!binding.modifiers.initial,
      validity: options.validity,
      aria: options.aria,
      initialValue: Generator.resolveInitialValue(vnode)
    };
  }

  static getCtorConfig (vnode) {
    if (!vnode.componentInstance) return null;

    const config = getPath('componentInstance.$options.$_veeValidate', vnode);

    return config;
  }

  /**
   * Resolves the rules defined on an element.
   */
  static resolveRules (el, binding, vnode) {
    let rules = '';
    if (!binding.value && (!binding || !binding.expression)) {
      rules = getDataAttribute(el, 'rules');
    }

    if (binding.value && ~['string', 'object'].indexOf(typeof binding.value.rules)) {
      rules = binding.value.rules;
    } else if (binding.value) {
      rules = binding.value;
    }

    if (vnode.componentInstance) {
      return rules;
    }

    return fillRulesFromElement(el, rules);
  }

  /**
   * @param {*} vnode
   */
  static resolveInitialValue (vnode) {
    const model = vnode.data.model || find(vnode.data.directives, d => d.name === 'model');

    return model && model.value;
  }

  /**
   * Creates a non-circular partial VM instance from a Vue instance.
   * @param {*} vm
   */
  static makeVM (vm) {
    return {
      get $el () {
        return vm.$el;
      },
      get $refs () {
        return vm.$refs;
      },
      $watch: vm.$watch ? vm.$watch.bind(vm) : () => {},
      $validator: vm.$validator ? {
        errors: vm.$validator.errors,
        validate: vm.$validator.validate.bind(vm.$validator),
        update: vm.$validator.update.bind(vm.$validator)
      } : null
    };
  }

  /**
   * Resolves the delay value.
   * @param {*} el
   * @param {*} vnode
   * @param {Object} options
   */
  static resolveDelay (el, vnode, options) {
    let delay = getDataAttribute(el, 'delay');
    const globalDelay = (options && 'delay' in options) ? options.delay : 0;

    if (!delay && vnode.componentInstance && vnode.componentInstance.$attrs) {
      delay = vnode.componentInstance.$attrs['data-vv-delay'];
    }

    if (!isObject(globalDelay)) {
      return deepParseInt(delay || globalDelay);
    }

    if (!isNullOrUndefined(delay)) {
      globalDelay.input = delay;
    }

    return deepParseInt(globalDelay);
  }

  /**
   * Resolves the events to validate in response to.
   * @param {*} el
   * @param {*} vnode
   */
  static resolveEvents (el, vnode) {
    let events = getDataAttribute(el, 'validate-on');

    if (!events && vnode.componentInstance && vnode.componentInstance.$attrs) {
      events = vnode.componentInstance.$attrs['data-vv-validate-on'];
    }

    if (!events && vnode.componentInstance) {
      const config = Generator.getCtorConfig(vnode);
      events = config && config.events;
    }

    return events;
  }

  /**
   * Resolves the scope for the field.
   * @param {*} el
   * @param {*} binding
   */
  static resolveScope (el, binding, vnode = {}) {
    let scope = null;
    if (vnode.componentInstance && isNullOrUndefined(scope)) {
      scope = vnode.componentInstance.$attrs && vnode.componentInstance.$attrs['data-vv-scope'];
    }

    return !isNullOrUndefined(scope) ? scope : getScope(el);
  }

  /**
   * Checks if the node directives contains a v-model or a specified arg.
   * Args take priority over models.
   *
   * @return {Object}
   */
  static resolveModel (binding, vnode) {
    if (binding.arg) {
      return { expression: binding.arg };
    }

    const model = vnode.data.model || find(vnode.data.directives, d => d.name === 'model');
    if (!model) {
      return null;
    }

    // https://github.com/vuejs/vue/blob/dev/src/core/util/lang.js#L26
    const watchable = !/[^\w.$]/.test(model.expression) && hasPath(model.expression, vnode.context);
    const lazy = !!(model.modifiers && model.modifiers.lazy);
    if (!watchable) {
      return { expression: null, lazy };
    }

    return { expression: model.expression, lazy };
  }

  /**
   * Resolves the field name to trigger validations.
   * @return {String} The field name.
   */
  static resolveName (el, vnode) {
    let name = getDataAttribute(el, 'name');

    if (!name && !vnode.componentInstance) {
      return el.name;
    }

    if (!name && vnode.componentInstance && vnode.componentInstance.$attrs) {
      name = vnode.componentInstance.$attrs['data-vv-name'] || vnode.componentInstance.$attrs['name'];
    }

    if (!name && vnode.componentInstance) {
      const config = Generator.getCtorConfig(vnode);
      if (config && isCallable(config.name)) {
        const boundGetter = config.name.bind(vnode.componentInstance);

        return boundGetter();
      }

      return vnode.componentInstance.name;
    }

    return name;
  }

  /**
   * Returns a value getter input type.
   */
  static resolveGetter (el, vnode, model) {
    if (model && model.expression) {
      return () => {
        return getPath(model.expression, vnode.context);
      };
    }

    if (vnode.componentInstance) {
      const path = getDataAttribute(el, 'value-path') || (vnode.componentInstance.$attrs && vnode.componentInstance.$attrs['data-vv-value-path']);
      if (path) {
        return () => {
          return getPath(path, vnode.componentInstance);
        };
      }

      const config = Generator.getCtorConfig(vnode);
      if (config && isCallable(config.value)) {
        const boundGetter = config.value.bind(vnode.componentInstance);

        return () => {
          return boundGetter();
        };
      }

      return () => {
        return vnode.componentInstance.value;
      };
    }

    switch (el.type) {
    case 'checkbox': return () => {
      let els = document.querySelectorAll(`input[name="${el.name}"]`);

      els = toArray(els).filter(el => el.checked);
      if (!els.length) return undefined;

      return els.map(checkbox => checkbox.value);
    };
    case 'radio': return () => {
      const els = document.querySelectorAll(`input[name="${el.name}"]`);
      const elm = find(els, el => el.checked);

      return elm && elm.value;
    };
    case 'file': return (context) => {
      return toArray(el.files);
    };
    case 'select-multiple': return () => {
      return toArray(el.options).filter(opt => opt.selected).map(opt => opt.value);
    };
    default: return () => {
      return el && el.value;
    };
    }
  }
}
